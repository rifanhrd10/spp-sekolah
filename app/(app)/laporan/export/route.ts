import { PermissionKey } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isWithinDateRange, readDateParam } from "@/lib/date-range";
import { excelResponse } from "@/lib/excel";
import { paymentTypeLabel, statusLabel } from "@/lib/format";
import { getRolePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";

const sheets = ["ringkasan", "siswa", "jenis", "pengeluaran", "kas"] as const;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const permissions = await getRolePermissions(user.role);
  if (!permissions.includes(PermissionKey.REPORT_VIEW)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const rawParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const requestedSheet = request.nextUrl.searchParams.get("sheet") ?? "ringkasan";
  const sheet = sheets.includes(requestedSheet as typeof sheets[number]) ? requestedSheet : "ringkasan";
  const query = readSearchParam(rawParams, "q");
  const from = readDateParam(rawParams, "from");
  const to = readDateParam(rawParams, "to");
  const assetAccountId = request.nextUrl.searchParams.get("assetAccountId") ?? "";

  const [allInvoices, allExpenses, allCashTransactions] = await Promise.all([
    prisma.invoice.findMany({
      where: { deletedAt: null },
      include: {
        paymentCategory: true,
        payments: {
          where: { deletedAt: null },
          include: { cashEntry: { include: { assetAccount: true } } },
        },
        student: { include: { classRoom: true } },
      },
    }),
    prisma.expense.findMany({
      where: { deletedAt: null },
      include: { categoryRef: true, cashEntry: { include: { assetAccount: true } } },
      orderBy: { spentAt: "desc" },
    }),
    prisma.cashTransaction.findMany({
      where: { deletedAt: null },
      include: { assetAccount: true },
      orderBy: { date: "desc" },
    }),
  ]);

  const invoices = allInvoices.filter((row) => isWithinDateRange(row.dueDate, from, to));
  const expenses = allExpenses.filter((row) => {
    if (!isWithinDateRange(row.spentAt, from, to)) return false;
    if (!assetAccountId) return true;
    return row.cashEntry?.assetAccountId === assetAccountId;
  });
  const cashTransactions = allCashTransactions.filter((row) => {
    if (!isWithinDateRange(row.date, from, to)) return false;
    if (!assetAccountId) return true;
    return row.assetAccountId === assetAccountId;
  });

  const totalBills = invoices.reduce((total, invoice) => total + invoice.amount, 0);
  const totalPaid = invoices.reduce(
    (total, invoice) =>
      total +
      invoice.payments
        .filter((payment) => !assetAccountId || payment.cashEntry?.assetAccountId === assetAccountId)
        .reduce((sum, payment) => sum + payment.amount, 0),
    0,
  );
  const cashIn = cashTransactions.filter((transaction) => transaction.type === "MASUK").reduce((total, transaction) => total + transaction.amount, 0);
  const cashOut = cashTransactions.filter((transaction) => transaction.type === "KELUAR").reduce((total, transaction) => total + transaction.amount, 0);

  if (sheet === "ringkasan") {
    return excelResponse(`laporan-ringkasan-${new Date().toISOString().slice(0, 10)}.xls`, [{
      name: "Ringkasan",
      rows: [
        ["Keterangan", "Nilai"],
        ["Total Tagihan", totalBills],
        ["Total Penerimaan", cashIn],
        ["Total Pengeluaran", cashOut],
        ["Saldo Kas", cashIn - cashOut],
        ["Sisa Tagihan", totalBills - totalPaid],
        ["Jumlah Tagihan", invoices.length],
        ["Jumlah Transaksi Kas Masuk", cashTransactions.filter((transaction) => transaction.type === "MASUK").length],
        ["Jumlah Transaksi Kas Keluar", cashTransactions.filter((transaction) => transaction.type === "KELUAR").length],
      ],
    }]);
  }

  const students = Array.from(invoices.reduce((map, invoice) => {
    const row = map.get(invoice.studentId) ?? {
      id: invoice.studentId,
      name: invoice.student.name,
      nisn: invoice.student.nisn,
      className: invoice.student.classRoom?.name ?? invoice.student.classNameSnapshot ?? "-",
      billed: 0,
      paid: 0,
    };
    row.billed += invoice.amount;
    row.paid += invoice.payments
      .filter((payment) => !assetAccountId || payment.cashEntry?.assetAccountId === assetAccountId)
      .reduce((sum, payment) => sum + payment.amount, 0);
    map.set(invoice.studentId, row);
    return map;
  }, new Map<string, { id: string; name: string; nisn: string; className: string; billed: number; paid: number }>())).map(([, row]) => row);

  if (sheet === "siswa") {
    const rows = students
      .filter((row) => matchesSearch(query, row.name, row.nisn, row.className))
      .map((row, index) => {
        const remaining = row.billed - row.paid;
        const status = remaining <= 0 ? "LUNAS" : row.paid > 0 ? "CICILAN" : "BELUM_BAYAR";
        return [index + 1, row.nisn, row.name, row.className, row.billed, row.paid, remaining, statusLabel(status)];
      });
    return excelResponse(`laporan-per-siswa-${new Date().toISOString().slice(0, 10)}.xls`, [{
      name: "Per Siswa",
      rows: [["No", "NISN", "Nama Siswa", "Kelas", "Tagihan", "Terbayar", "Sisa", "Status"], ...rows],
    }]);
  }

  if (sheet === "jenis") {
    const paymentTypes = Array.from(invoices.reduce((map, invoice) => {
      const name = invoice.paymentCategory?.name ?? paymentTypeLabel(invoice.type);
      const row = map.get(name) ?? { name, count: 0, billed: 0, paid: 0 };
      row.count += 1;
      row.billed += invoice.amount;
      row.paid += invoice.payments
        .filter((payment) => !assetAccountId || payment.cashEntry?.assetAccountId === assetAccountId)
        .reduce((sum, payment) => sum + payment.amount, 0);
      map.set(name, row);
      return map;
    }, new Map<string, { name: string; count: number; billed: number; paid: number }>())).map(([, row]) => row);
    const rows = paymentTypes
      .filter((row) => matchesSearch(query, row.name, row.count, row.billed, row.paid))
      .map((row, index) => [index + 1, row.name, row.count, row.billed, row.paid, row.billed - row.paid]);
    return excelResponse(`laporan-jenis-pembayaran-${new Date().toISOString().slice(0, 10)}.xls`, [{
      name: "Jenis Pembayaran",
      rows: [["No", "Jenis Pembayaran", "Jumlah Tagihan", "Nominal", "Terbayar", "Sisa"], ...rows],
    }]);
  }

  if (sheet === "pengeluaran") {
    const rows = expenses
      .filter((row) => matchesSearch(query, row.title, row.categoryRef?.name ?? row.categoryNameSnapshot, row.vendor, row.createdBy, row.cashEntry?.assetAccount?.code, row.cashEntry?.assetAccount?.name))
      .map((row, index) => [
        index + 1,
        row.spentAt,
        row.title,
        row.categoryRef?.name ?? row.categoryNameSnapshot ?? "",
        row.cashEntry?.assetAccount ? `${row.cashEntry.assetAccount.code} - ${row.cashEntry.assetAccount.name}` : "",
        row.vendor ?? "",
        row.createdBy,
        row.amount,
      ]);
    return excelResponse(`laporan-pengeluaran-${new Date().toISOString().slice(0, 10)}.xls`, [{
      name: "Pengeluaran",
      rows: [["No", "Tanggal", "Keperluan", "Kategori", "Kas / Bank", "Vendor", "Petugas", "Nominal"], ...rows],
    }]);
  }

  const rows = cashTransactions
    .filter((row) => matchesSearch(query, row.description, row.type, row.createdBy, row.assetAccount?.code, row.assetAccount?.name))
    .map((row, index) => [
      index + 1,
      row.date,
      row.type === "MASUK" ? "Kas Masuk" : "Kas Keluar",
      row.description,
      row.assetAccount ? `${row.assetAccount.code} - ${row.assetAccount.name}` : "",
      row.createdBy,
      row.amount,
    ]);
  return excelResponse(`laporan-arus-kas-${new Date().toISOString().slice(0, 10)}.xls`, [{
    name: "Arus Kas",
    rows: [["No", "Tanggal", "Jenis", "Keterangan", "Kas / Bank", "Pengguna", "Nominal"], ...rows],
  }]);
}
