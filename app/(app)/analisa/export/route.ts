import { PermissionKey } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { excelResponse } from "@/lib/excel";
import { paidTotal, remainingTotal } from "@/lib/finance";
import { paymentTypeLabel } from "@/lib/format";
import { getRolePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const permissions = await getRolePermissions(user.role);
  if (!permissions.includes(PermissionKey.ANALYTICS_VIEW)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const [invoices, expenses, students] = await Promise.all([
    prisma.invoice.findMany({
      where: { deletedAt: null },
      include: {
        payments: { where: { deletedAt: null }, select: { amount: true, paidAt: true } },
        student: { include: { classRoom: true } },
        paymentCategory: true,
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.expense.findMany({
      where: { deletedAt: null },
      include: { categoryRef: true },
      orderBy: { spentAt: "desc" },
    }),
    prisma.student.count({ where: { active: true, deletedAt: null } }),
  ]);

  const billed = invoices.reduce((total, invoice) => total + invoice.amount, 0);
  const collected = invoices.reduce((total, invoice) => total + paidTotal(invoice), 0);
  const outstanding = invoices.reduce((total, invoice) => total + remainingTotal(invoice), 0);
  const expenseTotal = expenses.reduce((total, expense) => total + expense.amount, 0);
  const collectionRate = percent(collected, billed);

  const byClass = Array.from(invoices.reduce((map, invoice) => {
    const className = invoice.student.classRoom?.name ?? invoice.student.classNameSnapshot ?? "-";
    const row = map.get(className) ?? { billed: 0, paid: 0 };
    row.billed += invoice.amount;
    row.paid += paidTotal(invoice);
    map.set(className, row);
    return map;
  }, new Map<string, { billed: number; paid: number }>())).sort(([left], [right]) => left.localeCompare(right));

  const byCategory = Array.from(expenses.reduce((map, expense) => {
    const name = expense.categoryRef?.name ?? expense.categoryNameSnapshot ?? "-";
    map.set(name, (map.get(name) ?? 0) + expense.amount);
    return map;
  }, new Map<string, number>())).sort((left, right) => right[1] - left[1]);

  const byPaymentType = Array.from(invoices.reduce((map, invoice) => {
    const name = invoice.paymentCategory?.name ?? paymentTypeLabel(invoice.type);
    const row = map.get(name) ?? { billed: 0, paid: 0 };
    row.billed += invoice.amount;
    row.paid += paidTotal(invoice);
    map.set(name, row);
    return map;
  }, new Map<string, { billed: number; paid: number }>())).sort((left, right) => right[1].billed - left[1].billed);

  const overdue = invoices.filter((invoice) => remainingTotal(invoice) > 0 && invoice.dueDate < new Date());
  const paidStudents = new Set(invoices.filter((invoice) => paidTotal(invoice) > 0).map((invoice) => invoice.studentId)).size;

  return excelResponse(`analisis-keuangan-${new Date().toISOString().slice(0, 10)}.xls`, [
    {
      name: "Ringkasan",
      rows: [
        ["Keterangan", "Nilai"],
        ["Total Tagihan", billed],
        ["Terkumpul", collected],
        ["Belum Tertagih", outstanding],
        ["Pengeluaran", expenseTotal],
        ["Saldo Bersih", collected - expenseTotal],
        ["Tingkat Penagihan (%)", collectionRate],
        ["Jumlah Tagihan", invoices.length],
        ["Siswa Aktif", students],
        ["Siswa Sudah Membayar", paidStudents],
        ["Siswa Belum Membayar", students - paidStudents],
        ["Tagihan Melewati Tempo", overdue.length],
      ],
    },
    {
      name: "Per Kelas",
      rows: [
        ["No", "Kelas", "Tagihan", "Diterima", "Sisa", "Realisasi (%)"],
        ...byClass.map(([className, row], index) => [index + 1, className, row.billed, row.paid, row.billed - row.paid, percent(row.paid, row.billed)]),
      ],
    },
    {
      name: "Pengeluaran",
      rows: [
        ["No", "Kategori", "Nominal", "Komposisi (%)"],
        ...byCategory.map(([name, amount], index) => [index + 1, name, amount, percent(amount, expenseTotal)]),
      ],
    },
    {
      name: "Jenis Pembayaran",
      rows: [
        ["No", "Jenis Pembayaran", "Tagihan", "Diterima", "Sisa", "Realisasi (%)"],
        ...byPaymentType.map(([name, row], index) => [index + 1, name, row.billed, row.paid, row.billed - row.paid, percent(row.paid, row.billed)]),
      ],
    },
  ]);
}
