import { PermissionKey } from "@prisma/client";
import { AlertTriangle, Banknote, ClipboardList, ReceiptText, Users, WalletCards } from "lucide-react";
import { NoticeFromParams, type PageSearchParams } from "@/components/notice-from-params";
import { TablePagination, TablePageSizeSelect } from "@/components/table-pagination";
import { SortableTh } from "@/components/sortable-th";
import { currency, paymentTypeLabel, shortDate, statusLabel } from "@/lib/format";
import { financeSummary, paidTotal, remainingTotal } from "@/lib/finance";
import { paginateItems, readPageParam, readPageSizeParam } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";
import { compareValues, readSortDirectionParam, readSortKeyParam } from "@/lib/sort";
import { requirePermission } from "@/lib/auth";

export default async function DashboardPage({ searchParams }: { searchParams: PageSearchParams }) {
  await requirePermission(PermissionKey.DASHBOARD_VIEW);
  const params = await searchParams;
  const query = readSearchParam(params, "tagihanQ");
  const page = readPageParam(params, "tagihanPage");
  const pageSize = readPageSizeParam(params, "tagihanPageSize");
  const sortKey = readSortKeyParam(params, "tagihanSort", "dueDate");
  const sortDirection = readSortDirectionParam(params, "tagihanDir", "asc");
  const [students, invoices, payments, expenses, cashTransactions] = await Promise.all([
    prisma.student.count({ where: { active: true, deletedAt: null } }),
    prisma.invoice.findMany({
      where: { deletedAt: null },
      include: {
        student: { include: { classRoom: true } },
        payments: { where: { deletedAt: null }, select: { amount: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.payment.findMany({
      where: { deletedAt: null },
      include: {
        invoice: {
          include: {
            student: { include: { classRoom: true } },
          },
        },
      },
      orderBy: { paidAt: "desc" },
      take: 6,
    }),
    prisma.expense.findMany({
      where: { deletedAt: null },
      include: { categoryRef: true },
      orderBy: { spentAt: "desc" },
      take: 6,
    }),
    prisma.cashTransaction.findMany({
      where: { deletedAt: null },
      select: { amount: true, type: true },
    }),
  ]);

  const summary = financeSummary(invoices, expenses, cashTransactions);
  const overdue = invoices.filter(
    (invoice) => remainingTotal(invoice) > 0 && invoice.dueDate < new Date(),
  );
  const matchingInvoices = invoices
    .filter((invoice) => remainingTotal(invoice) > 0)
    .filter((invoice) =>
      matchesSearch(
        query,
        invoice.student.name,
        invoice.student.classRoom?.name ?? invoice.student.classNameSnapshot,
        paymentTypeLabel(invoice.type),
        statusLabel(invoice.status),
        invoice.title,
      ),
    );
  const sortedInvoices = [...matchingInvoices].sort((left, right) => {
    switch (sortKey) {
      case "student":
        return compareValues(left.student.name, right.student.name, sortDirection);
      case "type":
        return compareValues(paymentTypeLabel(left.type), paymentTypeLabel(right.type), sortDirection);
      case "remaining":
        return compareValues(remainingTotal(left), remainingTotal(right), sortDirection);
      case "status":
        return compareValues(statusLabel(left.status), statusLabel(right.status), sortDirection);
      default:
        return compareValues(left.dueDate, right.dueDate, sortDirection);
    }
  });
  const paginatedInvoices = paginateItems(sortedInvoices, page, pageSize);

  return (
    <main className="page">
      <NoticeFromParams searchParams={searchParams} />

      {overdue.length ? (
        <div className="page-actions">
          <div className="status-pill rose">
            <AlertTriangle size={16} />
            {overdue.length} tagihan lewat tempo
          </div>
        </div>
      ) : null}

      <section className="summary-grid" aria-label="Ringkasan keuangan">
        <div className="metric">
          <div>
            <span className="label">Siswa Aktif</span>
            <strong>{students}</strong>
          </div>
          <div className="foot">
            <span>Data master</span>
            <Users size={20} />
          </div>
        </div>
        <div className="metric">
          <div>
            <span className="label">Total Tagihan</span>
            <strong>{currency(summary.totalBills)}</strong>
          </div>
          <div className="foot">
            <span>{invoices.length} tagihan</span>
            <ReceiptText size={20} />
          </div>
        </div>
        <div className="metric green">
          <div>
            <span className="label">Sudah Terbayar</span>
            <strong>{currency(summary.totalPaid)}</strong>
          </div>
          <div className="foot">
            <span>{payments.length} transaksi terbaru</span>
            <Banknote size={20} />
          </div>
        </div>
        <div className="metric amber">
          <div>
            <span className="label">Sisa Tagihan</span>
            <strong>{currency(summary.totalRemaining)}</strong>
          </div>
          <div className="foot">
            <span>{invoices.filter((invoice) => remainingTotal(invoice) > 0).length} belum lunas</span>
            <ClipboardList size={20} />
          </div>
        </div>
        <div className="metric cyan">
          <div>
            <span className="label">Saldo Kas</span>
            <strong>{currency(summary.balance)}</strong>
          </div>
          <div className="foot">
            <span>Masuk - keluar</span>
            <WalletCards size={20} />
          </div>
        </div>
      </section>

      <section className="content-grid two">
        <div className="panel">
          <div className="table-wrap">
            <table className="compact-table">
              <thead>
                <tr>
                  <th className="table-number">No</th>
                  <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Siswa" pathname="/dashboard" preserve={{ tagihanPageSize: String(pageSize), tagihanQ: query }} sortDirParam="tagihanDir" sortKey="student" sortKeyParam="tagihanSort" />
                  <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Jenis" pathname="/dashboard" preserve={{ tagihanPageSize: String(pageSize), tagihanQ: query }} sortDirParam="tagihanDir" sortKey="type" sortKeyParam="tagihanSort" />
                  <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Tempo" pathname="/dashboard" preserve={{ tagihanPageSize: String(pageSize), tagihanQ: query }} sortDirParam="tagihanDir" sortKey="dueDate" sortKeyParam="tagihanSort" />
                  <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Sisa" pathname="/dashboard" preserve={{ tagihanPageSize: String(pageSize), tagihanQ: query }} sortDirParam="tagihanDir" sortKey="remaining" sortKeyParam="tagihanSort" />
                  <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Status" pathname="/dashboard" preserve={{ tagihanPageSize: String(pageSize), tagihanQ: query }} sortDirParam="tagihanDir" sortKey="status" sortKeyParam="tagihanSort" />
                </tr>
              </thead>
              <tbody>
                {paginatedInvoices.items.length ? paginatedInvoices.items.map((invoice, index) => (
                    <tr key={invoice.id}>
                      <td className="table-number">{paginatedInvoices.startItem + index}</td>
                      <td>
                        <strong>{invoice.student.name}</strong>
                        <div className="subtle">{invoice.student.classRoom?.name ?? invoice.student.classNameSnapshot ?? "-"}</div>
                      </td>
                      <td>{paymentTypeLabel(invoice.type)}</td>
                      <td>{shortDate(invoice.dueDate)}</td>
                      <td className="money amber">{currency(remainingTotal(invoice))}</td>
                      <td>
                        <span className="badge amber">{statusLabel(invoice.status)}</span>
                      </td>
                    </tr>
                  )) : <tr><td className="empty" colSpan={6}>Tagihan yang dicari tidak ditemukan.</td></tr>}
              </tbody>
            </table>
          </div>
          <TablePagination currentPage={paginatedInvoices.currentPage} endItem={paginatedInvoices.endItem} pageKey="tagihanPage" pageSize={paginatedInvoices.pageSize} pageSizeKey="tagihanPageSize" pathname="/dashboard" preserve={{ tagihanDir: sortDirection, tagihanQ: query, tagihanSort: sortKey }} startItem={paginatedInvoices.startItem} totalItems={paginatedInvoices.totalItems} totalPages={paginatedInvoices.totalPages} />
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-header">
              <h3>Pembayaran Terbaru</h3>
              <span>{payments.length} transaksi</span>
            </div>
            <ul className="list">
              {payments.length ? payments.map((payment) => (
                <li key={payment.id}>
                  <div>
                    <strong>{payment.invoice.student.name}</strong>
                    <div className="subtle">
                      {payment.invoice.title} - {shortDate(payment.paidAt)}
                    </div>
                  </div>
                  <span className="money green">{currency(payment.amount)}</span>
                </li>
              )) : <li className="empty">Belum ada pembayaran yang tercatat.</li>}
            </ul>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Pengeluaran Terbaru</h3>
              <span>{expenses.length} catatan</span>
            </div>
            <ul className="list">
              {expenses.length ? expenses.map((expense) => (
                <li key={expense.id}>
                  <div>
                    <strong>{expense.title}</strong>
                    <div className="subtle">
                      {expense.categoryRef?.name ?? expense.categoryNameSnapshot ?? "-"} - {shortDate(expense.spentAt)}
                    </div>
                  </div>
                  <span className="money rose">{currency(expense.amount)}</span>
                </li>
              )) : <li className="empty">Belum ada pengeluaran yang tercatat.</li>}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
