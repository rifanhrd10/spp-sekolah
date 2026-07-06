import { AccountType, PermissionKey } from "@prisma/client";
import {
  Banknote,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  ReceiptText,
  Users,
  WalletCards,
} from "lucide-react";
import { NoticeFromParams, type PageSearchParams } from "@/components/notice-from-params";
import { DateRangeFilter } from "@/components/date-range-filter";
import { SortableTh } from "@/components/sortable-th";
import { TablePagination, TablePageSizeSelect } from "@/components/table-pagination";
import { TableSearch } from "@/components/table-search";
import { TableSelectFilter } from "@/components/table-select-filter";
import { WorkbookTabs } from "@/components/workbook-tabs";
import { requirePermission } from "@/lib/auth";
import { isWithinDateRange, readDateParam } from "@/lib/date-range";
import { currency, paymentTypeLabel, shortDate, statusLabel } from "@/lib/format";
import { paginateItems, readPageParam, readPageSizeParam } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";
import { compareValues, readSortDirectionParam, readSortKeyParam } from "@/lib/sort";

const reportTabs = [
  { key: "ringkasan", label: "Ringkasan", description: "Ikhtisar keuangan", icon: LayoutDashboard },
  { key: "siswa", label: "Per Siswa", description: "Tagihan dan pembayaran", icon: Users },
  { key: "jenis", label: "Jenis Pembayaran", description: "Rekap penerimaan", icon: ReceiptText },
  { key: "pengeluaran", label: "Pengeluaran", description: "Rincian biaya", icon: WalletCards },
  { key: "kas", label: "Arus Kas", description: "Kas masuk dan keluar", icon: BookOpen },
];

function paramValue(params: Awaited<PageSearchParams>, key: string, fallback: string) {
  const value = params[key];
  return typeof value === "string" ? value : fallback;
}

export default async function ReportsPage({ searchParams }: { searchParams: PageSearchParams }) {
  await requirePermission(PermissionKey.REPORT_VIEW);
  const params = await searchParams;
  const sheet = reportTabs.some((tab) => tab.key === paramValue(params, "sheet", "ringkasan"))
    ? paramValue(params, "sheet", "ringkasan")
    : "ringkasan";
  const query = readSearchParam(params, "q");
  const page = readPageParam(params, "page");
  const pageSize = readPageSizeParam(params, "pageSize");
  const sortKey = readSortKeyParam(params, "sort", "name");
  const sortDirection = readSortDirectionParam(params, "dir", "asc");
  const from = readDateParam(params, "from");
  const to = readDateParam(params, "to");
  const assetAccountId = typeof params.assetAccountId === "string" ? params.assetAccountId : "";
  const [allInvoices, allExpenses, allCashTransactions, assetAccounts] = await Promise.all([
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
    prisma.account.findMany({
      where: { active: true, deletedAt: null, type: AccountType.ASET },
      orderBy: { code: "asc" },
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
  const cashIn = cashTransactions
    .filter((transaction) => transaction.type === "MASUK")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const cashOut = cashTransactions
    .filter((transaction) => transaction.type === "KELUAR")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const cashBalance = cashIn - cashOut;
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

  const rows = sheet === "siswa"
    ? students
    : sheet === "jenis"
      ? paymentTypes
      : sheet === "pengeluaran"
        ? expenses
        : sheet === "kas"
          ? cashTransactions
          : [];
  const filteredRows = rows.filter((row) => {
    if (sheet === "siswa" && "nisn" in row) return matchesSearch(query, row.name, row.nisn, row.className);
    if (sheet === "jenis" && "count" in row) return matchesSearch(query, row.name, row.count, row.billed, row.paid);
    if (sheet === "pengeluaran" && "spentAt" in row) return matchesSearch(query, row.title, row.categoryRef?.name ?? row.categoryNameSnapshot, row.vendor, row.createdBy, row.cashEntry?.assetAccount?.code, row.cashEntry?.assetAccount?.name);
    if (sheet === "kas" && "type" in row) return matchesSearch(query, row.description, row.type, row.createdBy, row.assetAccount?.code, row.assetAccount?.name);
    return true;
  });
  const sortedRows = [...filteredRows].sort((left, right) => {
    const leftRecord = left as unknown as Record<string, unknown>;
    const rightRecord = right as unknown as Record<string, unknown>;
    const key = sortKey === "remaining"
      ? null
      : sortKey;
    if (key) return compareValues(leftRecord[key] as string | number | Date | null | undefined, rightRecord[key] as string | number | Date | null | undefined, sortDirection);
    const leftRemaining = Number(leftRecord.billed ?? 0) - Number(leftRecord.paid ?? 0);
    const rightRemaining = Number(rightRecord.billed ?? 0) - Number(rightRecord.paid ?? 0);
    return compareValues(leftRemaining, rightRemaining, sortDirection);
  });
  const paginated = paginateItems(sortedRows, page, pageSize);
  const preserve = { assetAccountId, dir: sortDirection, from, q: query, sheet, sort: sortKey, to };
  const tablePreserve = { assetAccountId, from, pageSize: String(pageSize), q: query, sheet, to };
  const assetFilter = (
    <TableSelectFilter
      allLabel="Semua kas / bank"
      options={assetAccounts.map((account) => ({ label: `${account.code} - ${account.name}`, value: account.id }))}
      preserve={{ from, q: query, sheet, sort: sortKey, to }}
      value={assetAccountId}
      valueKey="assetAccountId"
    />
  );
  const tableToolbar = sheet !== "ringkasan" ? (
    <div className="table-toolbar-controls">
      <TableSearch placeholder={`Cari data ${reportTabs.find((tab) => tab.key === sheet)?.label.toLowerCase()}`} preserve={{ assetAccountId, from, sheet, to }} query={query} />
      {assetFilter}
      <TablePageSizeSelect pageSize={paginated.pageSize} pathname="/laporan" preserve={preserve} />
    </div>
  ) : null;

  return (
    <main className="page workbook-page">
      <WorkbookTabs active={sheet} pathname="/laporan" tabs={reportTabs} />
      <NoticeFromParams searchParams={searchParams} />
      <div className="report-filter-row">
        <DateRangeFilter from={from} pathname="/laporan" preserve={{ assetAccountId, q: query, sheet }} to={to} />
        <div className="report-filter-account">{assetFilter}</div>
      </div>

      {sheet === "ringkasan" ? (
        <>
          <div className="callout callout-blue accounting-callout">
            Laporan ini diringkas agar mudah dipakai bendahara. Filter kas atau bank mempengaruhi penerimaan, pengeluaran, dan arus kas pada periode aktif, sedangkan total tagihan tetap mengikuti data tagihan di periode tersebut.
          </div>
          <section className="summary-grid report">
            <div className="metric"><div><span className="label">Total Tagihan</span><strong>{currency(totalBills)}</strong></div><div className="foot"><span>{invoices.length} tagihan</span><ClipboardList size={20} /></div></div>
            <div className="metric green"><div><span className="label">Total Penerimaan</span><strong>{currency(cashIn)}</strong></div><div className="foot"><span>{cashTransactions.filter((transaction) => transaction.type === "MASUK").length} transaksi kas masuk</span><Banknote size={20} /></div></div>
            <div className="metric rose"><div><span className="label">Total Pengeluaran</span><strong>{currency(cashOut)}</strong></div><div className="foot"><span>{cashTransactions.filter((transaction) => transaction.type === "KELUAR").length} transaksi kas keluar</span><WalletCards size={20} /></div></div>
            <div className="metric cyan"><div><span className="label">Saldo Kas</span><strong>{currency(cashBalance)}</strong></div><div className="foot"><span>Kas masuk dikurangi kas keluar</span><BookOpen size={20} /></div></div>
          </section>
          <section className="panel report-overview">
            <div className="panel-heading"><div><span>Kesimpulan</span><h2>Kondisi Keuangan Sekolah</h2></div></div>
            <div className="report-kpis">
              <div><span>Sisa tagihan</span><strong>{currency(totalBills - totalPaid)}</strong></div>
              <div><span>Siswa tertagih</span><strong>{students.length}</strong></div>
              <div><span>Rata-rata tagihan</span><strong>{currency(totalBills / Math.max(students.length, 1))}</strong></div>
              <div><span>Rasio pengeluaran</span><strong>{Math.round((cashOut / Math.max(cashIn, 1)) * 100)}%</strong></div>
            </div>
          </section>
        </>
      ) : (
        <section className="panel workbook-sheet">
          <div className="sheet-toolbar">{tableToolbar}</div>
          <div className="table-wrap">
            {sheet === "siswa" ? (
              <table><thead><tr>
                <th className="table-number">No</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Siswa" pathname="/laporan" preserve={tablePreserve} sortKey="name" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Kelas" pathname="/laporan" preserve={tablePreserve} sortKey="className" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Tagihan" pathname="/laporan" preserve={tablePreserve} sortKey="billed" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Terbayar" pathname="/laporan" preserve={tablePreserve} sortKey="paid" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Sisa" pathname="/laporan" preserve={tablePreserve} sortKey="remaining" />
                <th>Status</th>
              </tr></thead><tbody>{(paginated.items as typeof students).length ? (paginated.items as typeof students).map((row, index) => {
                const remaining = row.billed - row.paid;
                const status = remaining <= 0 ? "LUNAS" : row.paid > 0 ? "CICILAN" : "BELUM_BAYAR";
                return <tr key={row.id}><td className="table-number">{paginated.startItem + index}</td><td><strong>{row.name}</strong><div className="subtle">NISN {row.nisn}</div></td><td>{row.className}</td><td className="money">{currency(row.billed)}</td><td className="money green">{currency(row.paid)}</td><td className="money amber">{currency(remaining)}</td><td><span className={`badge ${status === "LUNAS" ? "green" : "amber"}`}>{statusLabel(status)}</span></td></tr>;
              }) : <tr><td className="empty" colSpan={7}>Data siswa tidak ditemukan pada filter yang dipilih.</td></tr>}</tbody></table>
            ) : sheet === "jenis" ? (
              <table><thead><tr>
                <th className="table-number">No</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Jenis Pembayaran" pathname="/laporan" preserve={tablePreserve} sortKey="name" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Jumlah Tagihan" pathname="/laporan" preserve={tablePreserve} sortKey="count" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Nominal" pathname="/laporan" preserve={tablePreserve} sortKey="billed" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Terbayar" pathname="/laporan" preserve={tablePreserve} sortKey="paid" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Sisa" pathname="/laporan" preserve={tablePreserve} sortKey="remaining" />
              </tr></thead><tbody>{(paginated.items as typeof paymentTypes).length ? (paginated.items as typeof paymentTypes).map((row, index) => <tr key={row.name}><td className="table-number">{paginated.startItem + index}</td><td><strong>{row.name}</strong></td><td>{row.count}</td><td className="money">{currency(row.billed)}</td><td className="money green">{currency(row.paid)}</td><td className="money amber">{currency(row.billed - row.paid)}</td></tr>) : <tr><td className="empty" colSpan={6}>Jenis pembayaran tidak ditemukan pada filter yang dipilih.</td></tr>}</tbody></table>
            ) : sheet === "pengeluaran" ? (
              <table><thead><tr>
                <th className="table-number">No</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Tanggal" pathname="/laporan" preserve={tablePreserve} sortKey="spentAt" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Keperluan" pathname="/laporan" preserve={tablePreserve} sortKey="title" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Kategori" pathname="/laporan" preserve={tablePreserve} sortKey="category" />
                <th>Kas / Bank</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Vendor" pathname="/laporan" preserve={tablePreserve} sortKey="vendor" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Nominal" pathname="/laporan" preserve={tablePreserve} sortKey="amount" />
              </tr></thead><tbody>{(paginated.items as typeof expenses).length ? (paginated.items as typeof expenses).map((row, index) => <tr key={row.id}><td className="table-number">{paginated.startItem + index}</td><td>{shortDate(row.spentAt)}</td><td><strong>{row.title}</strong></td><td>{row.categoryRef?.name ?? row.categoryNameSnapshot}</td><td>{row.cashEntry?.assetAccount ? <><strong>{row.cashEntry.assetAccount.code}</strong><div className="subtle">{row.cashEntry.assetAccount.name}</div></> : "-"}</td><td>{row.vendor || "-"}</td><td className="money rose">{currency(row.amount)}</td></tr>) : <tr><td className="empty" colSpan={7}>Pengeluaran tidak ditemukan pada filter yang dipilih.</td></tr>}</tbody></table>
            ) : (
              <table><thead><tr>
                <th className="table-number">No</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Tanggal" pathname="/laporan" preserve={tablePreserve} sortKey="date" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Jenis" pathname="/laporan" preserve={tablePreserve} sortKey="type" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Keterangan" pathname="/laporan" preserve={tablePreserve} sortKey="description" />
                <th>Kas / Bank</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Pengguna" pathname="/laporan" preserve={tablePreserve} sortKey="createdBy" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Nominal" pathname="/laporan" preserve={tablePreserve} sortKey="amount" />
              </tr></thead><tbody>{(paginated.items as typeof cashTransactions).length ? (paginated.items as typeof cashTransactions).map((row, index) => <tr key={row.id}><td className="table-number">{paginated.startItem + index}</td><td>{shortDate(row.date)}</td><td><span className={`badge ${row.type === "MASUK" ? "green" : "rose"}`}>{row.type === "MASUK" ? "Masuk" : "Keluar"}</span></td><td><strong>{row.description}</strong></td><td>{row.assetAccount ? <><strong>{row.assetAccount.code}</strong><div className="subtle">{row.assetAccount.name}</div></> : "-"}</td><td>{row.createdBy}</td><td className={`money ${row.type === "MASUK" ? "green" : "rose"}`}>{currency(row.amount)}</td></tr>) : <tr><td className="empty" colSpan={7}>Transaksi kas tidak ditemukan pada filter yang dipilih.</td></tr>}</tbody></table>
            )}
          </div>
          <TablePagination currentPage={paginated.currentPage} endItem={paginated.endItem} pageSize={paginated.pageSize} pathname="/laporan" preserve={preserve} startItem={paginated.startItem} totalItems={paginated.totalItems} totalPages={paginated.totalPages} />
        </section>
      )}
    </main>
  );
}
