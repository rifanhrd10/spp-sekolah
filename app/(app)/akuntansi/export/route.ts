import { AccountType, PermissionKey } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isWithinDateRange, readDateParam } from "@/lib/date-range";
import { excelResponse } from "@/lib/excel";
import { getAllowedExpenseCategoryIds, getRolePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";

const sheets = ["jurnal", "buku-besar", "neraca-saldo", "daftar-akun"] as const;
const sources = ["PAYMENT", "EXPENSE", "CASH", "MANUAL"] as const;

function accountBalance(type: AccountType, debit: number, credit: number) {
  return type === AccountType.ASET || type === AccountType.BEBAN
    ? debit - credit
    : credit - debit;
}

function sourceLabel(sourceType: string | null | undefined) {
  switch (sourceType) {
    case "PAYMENT":
      return "Pembayaran";
    case "EXPENSE":
      return "Pengeluaran";
    case "CASH":
      return "Buku Kas Manual";
    case "MANUAL":
      return "Jurnal Manual";
    default:
      return "Jurnal Umum";
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const permissions = await getRolePermissions(user.role);
  if (!permissions.includes(PermissionKey.ACCOUNTING_VIEW)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const rawParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const requestedSheet = request.nextUrl.searchParams.get("sheet") ?? "jurnal";
  const sheet = sheets.includes(requestedSheet as typeof sheets[number]) ? requestedSheet : "jurnal";
  const query = readSearchParam(rawParams, "q");
  const from = readDateParam(rawParams, "from");
  const to = readDateParam(rawParams, "to");
  const assetAccountId = request.nextUrl.searchParams.get("assetAccountId") ?? "";
  const requestedSource = request.nextUrl.searchParams.get("source") ?? "";
  const source = sources.includes(requestedSource as typeof sources[number]) ? requestedSource : "";
  const expenseCategoryId = request.nextUrl.searchParams.get("expenseCategoryId") ?? "";

  const allowedExpenseCategoryIds = await getAllowedExpenseCategoryIds(user.role);
  if (expenseCategoryId && allowedExpenseCategoryIds !== null && !allowedExpenseCategoryIds.includes(expenseCategoryId)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const [accounts, journals, expenseIds] = await Promise.all([
    prisma.account.findMany({
      where: { deletedAt: null },
      include: { lines: true },
      orderBy: { code: "asc" },
    }),
    prisma.journalEntry.findMany({
      where: { deletedAt: null },
      include: { lines: { include: { account: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    expenseCategoryId
      ? prisma.expense.findMany({ where: { categoryId: expenseCategoryId, deletedAt: null }, select: { id: true } })
      : Promise.resolve([]),
  ]);

  const expenseIdSet = new Set(expenseIds.map((expense) => expense.id));
  const effectiveSource = expenseCategoryId ? "EXPENSE" : source;
  const rangeJournals = journals
    .filter((journal) => {
      if (expenseCategoryId) {
        return journal.sourceType === "EXPENSE" && Boolean(journal.sourceId && expenseIdSet.has(journal.sourceId));
      }
      if (effectiveSource) return journal.sourceType === effectiveSource;
      return true;
    })
    .filter((journal) => {
      if (!isWithinDateRange(journal.date, from, to)) return false;
      if (!assetAccountId) return true;
      return journal.lines.some((line) => line.accountId === assetAccountId);
    });

  if (sheet === "jurnal") {
    const rows = rangeJournals
      .filter((journal) => matchesSearch(query, journal.number, journal.description, journal.sourceType, ...journal.lines.map((line) => `${line.account.code} ${line.account.name}`)))
      .flatMap((journal, journalIndex) => journal.lines.map((line) => [
        journalIndex + 1,
        journal.date,
        journal.number,
        journal.description,
        sourceLabel(journal.sourceType),
        `${line.account.code} - ${line.account.name}`,
        line.debit,
        line.credit,
      ]));

    return excelResponse(`akuntansi-jurnal-${new Date().toISOString().slice(0, 10)}.xls`, [{
      name: "Jurnal Umum",
      rows: [["No", "Tanggal", "Nomor", "Keterangan", "Sumber", "Akun", "Debit", "Kredit"], ...rows],
    }]);
  }

  if (sheet === "buku-besar") {
    const rows = rangeJournals
      .flatMap((journal) => journal.lines.map((line) => ({
        date: journal.date,
        number: journal.number,
        description: journal.description,
        sourceType: journal.sourceType,
        accountCode: line.account.code,
        accountName: line.account.name,
        debit: line.debit,
        credit: line.credit,
      })))
      .filter((row) => matchesSearch(query, row.number, row.description, row.accountCode, row.accountName, row.sourceType))
      .map((row, index) => [
        index + 1,
        row.date,
        `${row.accountCode} - ${row.accountName}`,
        row.number,
        row.description,
        sourceLabel(row.sourceType),
        row.debit,
        row.credit,
      ]);

    return excelResponse(`akuntansi-buku-besar-${new Date().toISOString().slice(0, 10)}.xls`, [{
      name: "Buku Besar",
      rows: [["No", "Tanggal", "Akun", "Nomor", "Keterangan", "Sumber", "Debit", "Kredit"], ...rows],
    }]);
  }

  const balanceRows = accounts
    .map((account) => {
      const lines = rangeJournals.flatMap((journal) => journal.lines).filter((line) => line.accountId === account.id);
      const debit = lines.reduce((sum, line) => sum + line.debit, 0);
      const credit = lines.reduce((sum, line) => sum + line.credit, 0);
      return { ...account, debit, credit, balance: accountBalance(account.type, debit, credit) };
    })
    .filter((row) => matchesSearch(query, row.code, row.name, row.type));

  if (sheet === "neraca-saldo") {
    return excelResponse(`akuntansi-neraca-saldo-${new Date().toISOString().slice(0, 10)}.xls`, [{
      name: "Neraca Saldo",
      rows: [
        ["No", "Kode", "Nama Akun", "Jenis", "Total Debit", "Total Kredit", "Saldo"],
        ...balanceRows.map((row, index) => [index + 1, row.code, row.name, row.type, row.debit, row.credit, row.balance]),
      ],
    }]);
  }

  return excelResponse(`akuntansi-daftar-akun-${new Date().toISOString().slice(0, 10)}.xls`, [{
    name: "Daftar Akun",
    rows: [
      ["No", "Kode", "Nama Akun", "Jenis", "Saldo", "Status"],
      ...balanceRows.map((row, index) => [index + 1, row.code, row.name, row.type, row.balance, row.active ? "Aktif" : "Nonaktif"]),
    ],
  }]);
}
