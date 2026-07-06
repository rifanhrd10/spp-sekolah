import { PermissionKey } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchesSearch } from "@/lib/search";
import { latestClassSnapshot, latestGraduationYear } from "@/lib/student-history";
import { getRolePermissions } from "@/lib/permissions";

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const permissions = await getRolePermissions(user.role);
  if (!permissions.includes(PermissionKey.MASTER_STUDENT)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";
  const graduationYearFilter = request.nextUrl.searchParams.get("graduationYear") ?? "";
  const finalClassFilter = request.nextUrl.searchParams.get("finalClass") ?? "";

  const students = await prisma.student.findMany({
    where: { deletedAt: null },
    include: {
      classHistory: { orderBy: { movedAt: "asc" } },
      invoices: {
        where: { deletedAt: null },
        include: {
          payments: { where: { deletedAt: null }, select: { amount: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const alumni = students
    .filter((student) => !student.active || student.promotionStatus === "LULUS")
    .filter((student) => !graduationYearFilter || latestGraduationYear(student) === graduationYearFilter)
    .filter((student) => !finalClassFilter || latestClassSnapshot(student) === finalClassFilter)
    .filter((student) =>
      matchesSearch(
        query,
        student.name,
        student.nisn,
        student.guardianName,
        student.phone,
        latestGraduationYear(student),
        latestClassSnapshot(student),
      ),
    );

  const rows = [
    ["NISN", "Nama Siswa", "Wali Murid", "Telepon", "Kelas Terakhir", "Tahun Lulus", "Status", "Total Tagihan", "Sisa Tagihan"],
    ...alumni.map((student) => {
      const billed = student.invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
      const paid = student.invoices.reduce(
        (sum, invoice) => sum + invoice.payments.reduce((paymentSum, payment) => paymentSum + payment.amount, 0),
        0,
      );
      return [
        student.nisn,
        student.name,
        student.guardianName,
        student.phone ?? "",
        latestClassSnapshot(student),
        latestGraduationYear(student),
        student.promotionStatus,
        billed,
        Math.max(billed - paid, 0),
      ];
    }),
  ];

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const filename = `data-alumni-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
