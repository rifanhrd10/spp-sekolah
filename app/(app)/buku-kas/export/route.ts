import { CashType, PermissionKey } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isWithinDateRange, readDateParam } from "@/lib/date-range";
import { excelResponse } from "@/lib/excel";
import { getAllowedExpenseCategoryIds, getRolePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const permissions = await getRolePermissions(user.role);
  if (!permissions.includes(PermissionKey.CASHBOOK_VIEW)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const rawParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const query = readSearchParam(rawParams, "q");
  const from = readDateParam(rawParams, "from");
  const to = readDateParam(rawParams, "to");
  const assetAccountId = request.nextUrl.searchParams.get("assetAccountId") ?? "";
  const typeParam = request.nextUrl.searchParams.get("type");
  const type = typeParam === CashType.MASUK || typeParam === CashType.KELUAR ? typeParam : "";
  const expenseCategoryId = request.nextUrl.searchParams.get("expenseCategoryId") ?? "";

  const allowedExpenseCategoryIds = await getAllowedExpenseCategoryIds(user.role);
  if (expenseCategoryId && allowedExpenseCategoryIds !== null && !allowedExpenseCategoryIds.includes(expenseCategoryId)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const effectiveType = expenseCategoryId ? CashType.KELUAR : type;
  const entries = await prisma.cashTransaction.findMany({
    where: {
      deletedAt: null,
      ...(effectiveType ? { type: effectiveType } : {}),
      ...(expenseCategoryId ? { expense: { is: { categoryId: expenseCategoryId } } } : {}),
    },
    include: {
      assetAccount: true,
      contraAccount: true,
      expense: { include: { categoryRef: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const rows = entries
    .filter((entry) => {
      if (!isWithinDateRange(entry.date, from, to)) return false;
      if (assetAccountId && entry.assetAccountId !== assetAccountId) return false;
      return matchesSearch(
        query,
        entry.description,
        entry.type,
        entry.createdBy,
        entry.assetAccount?.code,
        entry.assetAccount?.name,
        entry.expense?.categoryRef?.name,
        entry.expense?.categoryNameSnapshot,
      );
    })
    .map((entry, index) => [
      index + 1,
      entry.date,
      entry.type === CashType.MASUK ? "Kas Masuk" : "Kas Keluar",
      entry.description,
      entry.assetAccount ? `${entry.assetAccount.code} - ${entry.assetAccount.name}` : "",
      entry.contraAccount ? `${entry.contraAccount.code} - ${entry.contraAccount.name}` : "",
      entry.expense?.categoryRef?.name ?? entry.expense?.categoryNameSnapshot ?? "",
      entry.createdBy,
      entry.type === CashType.MASUK ? entry.amount : 0,
      entry.type === CashType.KELUAR ? entry.amount : 0,
    ]);

  const filename = `buku-kas-${new Date().toISOString().slice(0, 10)}.xls`;
  return excelResponse(filename, [{
    name: "Buku Kas",
    rows: [
      ["No", "Tanggal", "Jenis", "Keterangan", "Kas / Bank", "Akun Lawan", "Kategori Pengeluaran", "Pengguna", "Kas Masuk", "Kas Keluar"],
      ...rows,
    ],
  }]);
}
