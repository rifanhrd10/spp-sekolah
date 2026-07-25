import { AccountType, PermissionKey } from "@prisma/client";
import { Banknote, Pencil, Plus, Printer, ReceiptText, UsersRound } from "lucide-react";
import Link from "next/link";
import { deletePaymentReceipt, updatePaymentReceipt } from "@/app/actions";
import { ConfirmDelete, Modal, ModalCancelButton } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { PaymentEntry } from "@/components/payment-entry";
import {
  NoticeFromParams,
  type PageSearchParams,
} from "@/components/notice-from-params";
import { TablePagination, TablePageSizeSelect } from "@/components/table-pagination";
import { SortableTh } from "@/components/sortable-th";
import { TableSearch } from "@/components/table-search";
import { requirePermission } from "@/lib/auth";
import { currency, paymentTypeLabel, shortDate } from "@/lib/format";
import { remainingTotal } from "@/lib/finance";
import { paginateItems, readPageParam, readPageSizeParam } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";
import { compareValues, readSortDirectionParam, readSortKeyParam } from "@/lib/sort";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const user = await requirePermission(PermissionKey.PAYMENT_MANAGE);
  const params = await searchParams;
  const query = readSearchParam(params, "q");
  const page = readPageParam(params, "page");
  const pageSize = readPageSizeParam(params, "pageSize");
  const sortKey = readSortKeyParam(params, "sort", "paidAt");
  const sortDirection = readSortDirectionParam(params, "dir", "desc");
  const [invoices, payments, assetAccounts] = await Promise.all([
    prisma.invoice.findMany({
      where: { deletedAt: null },
      include: {
        paymentCategory: true,
        student: { include: { classRoom: true } },
        payments: { where: { deletedAt: null }, select: { amount: true } },
      },
      orderBy: [{ student: { name: "asc" } }, { dueDate: "asc" }],
    }),
    prisma.payment.findMany({
      where: { deletedAt: null },
      include: {
        cashEntry: { include: { assetAccount: true } },
        invoice: { include: { student: { include: { classRoom: true } } } },
      },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.account.findMany({
      where: { deletedAt: null, active: true, type: AccountType.ASET },
      orderBy: { code: "asc" },
    }),
  ]);
  type PaymentItem = (typeof payments)[number];
  const paymentRows = Array.from(
    payments.reduce((map, item) => {
      const key = item.receiptNo ?? item.id;
      const existing = map.get(key) ?? {
        id: item.id,
        receiptNo: item.receiptNo,
        paidAt: item.paidAt,
        method: item.method,
        note: item.note,
        receivedBy: item.receivedBy,
        items: [] as PaymentItem[],
        totalAmount: 0,
      };
      existing.items.push(item);
      existing.totalAmount += item.amount;
      if (item.paidAt > existing.paidAt) existing.paidAt = item.paidAt;
      map.set(key, existing);
      return map;
    }, new Map<string, { id: string; receiptNo: string | null; paidAt: Date; method: string; note: string | null; receivedBy: string; items: PaymentItem[]; totalAmount: number }>()),
  ).map(([, row]) => row);
  const filteredPaymentRows = paymentRows.filter((row) =>
    matchesSearch(
      query,
      row.receiptNo,
      row.items[0]?.invoice.student.name,
      row.items[0]?.invoice.student.classRoom?.name ?? row.items[0]?.invoice.student.classNameSnapshot,
      row.items.map((item) => item.invoice.title).join(" "),
      row.method,
      row.receivedBy,
      row.items[0]?.cashEntry?.assetAccount?.name,
      row.items[0]?.cashEntry?.assetAccount?.code,
    ),
  );
  const sortedPaymentRows = [...filteredPaymentRows].sort((left, right) => {
    switch (sortKey) {
      case "student":
        return compareValues(left.items[0]?.invoice.student.name, right.items[0]?.invoice.student.name, sortDirection);
      case "invoice":
        return compareValues(left.items.map((item) => item.invoice.title).join(" "), right.items.map((item) => item.invoice.title).join(" "), sortDirection);
      case "method":
        return compareValues(left.method, right.method, sortDirection);
      case "amount":
        return compareValues(left.totalAmount, right.totalAmount, sortDirection);
      case "receivedBy":
        return compareValues(left.receivedBy, right.receivedBy, sortDirection);
      default:
        return compareValues(left.paidAt, right.paidAt, sortDirection);
    }
  });
  const paginatedPaymentRows = paginateItems(sortedPaymentRows, page, pageSize);
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const uniqueStudents = new Set(payments.map((payment) => payment.invoice.studentId)).size;
  const latestPayment = payments[0]?.paidAt;
  const payable = invoices.filter((item) => remainingTotal(item) > 0);
  const payableStudents = Array.from(
    payable.reduce((map, invoice) => {
      const existing = map.get(invoice.student.id) ?? {
        id: invoice.student.id,
        name: invoice.student.name,
        nisn: invoice.student.nisn,
        className: invoice.student.classRoom?.name ?? invoice.student.classNameSnapshot ?? "-",
        invoices: [],
      };
      existing.invoices.push({
        id: invoice.id,
        title: invoice.title,
        category: invoice.paymentCategory?.name ?? paymentTypeLabel(invoice.type),
        dueDate: shortDate(invoice.dueDate),
        remaining: remainingTotal(invoice),
      });
      map.set(invoice.student.id, existing);
      return map;
    }, new Map<string, { id: string; name: string; nisn: string; className: string; invoices: { id: string; title: string; category: string; dueDate: string; remaining: number }[] }>()),
  ).map(([, student]) => student);
  const editForm = (row: (typeof paymentRows)[number]) => (
    <form action={updatePaymentReceipt} className="form-stack">
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <strong>{row.items[0]?.invoice.student.name}</strong>
        <div>{row.receiptNo || "-"} · {row.items.length} item pembayaran</div>
      </div>
      <div className="batch-lines">
        {row.items.map((item, index) => (
          <section className="batch-line selected" key={item.id}>
            <input name="id" type="hidden" value={item.id} />
            <div className="batch-line-head">
              <div>
                <strong>Item {index + 1}: {item.invoice.title}</strong>
                <div className="subtle">{paymentTypeLabel(item.invoice.type)}</div>
              </div>
            </div>
            <label>
              Nominal
              <MoneyInput defaultValue={item.amount} name="amount" />
            </label>
          </section>
        ))}
      </div>
      <div className="field-grid">
        <label>
          Tanggal
          <input
            defaultValue={row.paidAt.toISOString().slice(0, 10)}
            name="paidAt"
            required
            type="date"
          />
        </label>
      </div>
      <label>
        Kas / Bank
        <select defaultValue={row.items[0]?.cashEntry?.assetAccountId ?? ""} name="assetAccountId" required>
          <option disabled value="">Pilih kas / bank</option>
          {assetAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.code} - {account.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Metode
        <select defaultValue={row.method} name="method">
          <option>Tunai</option>
          <option>Transfer</option>
          <option>QRIS</option>
        </select>
      </label>
      <label>
        Catatan
        <input defaultValue={row.note ?? ""} name="note" />
      </label>
      <div className="form-actions">
        <ModalCancelButton />
        <button className="btn btn-edit" type="submit">
          Simpan Perubahan
        </button>
      </div>
    </form>
  );
  return (
    <main className="page">
      <section className="page-title">
        <div className="page-title-copy">
          <div className="table-toolbar-controls">
            <TablePageSizeSelect pageSize={paginatedPaymentRows.pageSize} pathname="/transaksi/pembayaran" preserve={{ dir: sortDirection, q: query, sort: sortKey }} />
            <TableSearch placeholder="Cari kwitansi, siswa, tagihan, metode, atau petugas" query={query} />
          </div>
        </div>
        <Modal
          size="xl"
          title="Catat Pembayaran Siswa"
          description="Tagihan, kas, dan akuntansi diperbarui dalam satu transaksi."
          trigger={
            <button className="btn btn-create" type="button">
              <Plus size={17} /> Catat Pembayaran
            </button>
          }
        >
          <PaymentEntry assetAccounts={assetAccounts.map((account) => ({ id: account.id, code: account.code, name: account.name }))} receivedBy={user.name} students={payableStudents} />
        </Modal>
      </section>
      <NoticeFromParams searchParams={searchParams} />
      <section className="summary-grid report">
        <div className="metric green"><div><span className="label">Total Pembayaran</span><strong>{currency(totalPaid)}</strong></div><div className="foot"><span>{paymentRows.length} kwitansi · {payments.length} item</span><Banknote size={20} /></div></div>
        <div className="metric"><div><span className="label">Siswa Membayar</span><strong>{uniqueStudents}</strong></div><div className="foot"><span>Terhubung ke tagihan</span><UsersRound size={20} /></div></div>
        <div className="metric cyan"><div><span className="label">Transaksi Terakhir</span><strong>{latestPayment ? shortDate(latestPayment) : "-"}</strong></div><div className="foot"><span>Kwitansi otomatis</span><ReceiptText size={20} /></div></div>
      </section>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="table-number">No</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="No. Kwitansi / Tanggal" pathname="/transaksi/pembayaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="paidAt" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Siswa" pathname="/transaksi/pembayaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="student" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Tagihan" pathname="/transaksi/pembayaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="invoice" />
                <th>Kas / Bank</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Metode" pathname="/transaksi/pembayaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="method" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Nominal" pathname="/transaksi/pembayaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="amount" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Petugas" pathname="/transaksi/pembayaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="receivedBy" />
                <th className="table-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPaymentRows.items.length ? (
                paginatedPaymentRows.items.map((row, index) => {
                  const firstItem = row.items[0];
                  return (
                  <tr key={row.receiptNo ?? row.id}>
                    <td className="table-number">{paginatedPaymentRows.startItem + index}</td>
                    <td>
                      <strong>{row.receiptNo || "-"}</strong>
                      <div className="subtle">{shortDate(row.paidAt)}</div>
                    </td>
                    <td>
                      <Link className="inline-link" href={`/master/siswa?classId=${firstItem?.invoice.student.classRoomId ?? ""}&q=${encodeURIComponent(firstItem?.invoice.student.name ?? "")}`}>{firstItem?.invoice.student.name ?? "-"}</Link>
                      <div className="subtle">
                        {firstItem?.invoice.student.classRoom?.name ?? firstItem?.invoice.student.classNameSnapshot ?? "-"}
                      </div>
                    </td>
                    <td>
                      {row.items.length > 1 ? `${row.items.length} tagihan` : firstItem?.invoice.title}
                      <div className="subtle">
                        {row.items.map((item) => item.invoice.title).join(", ")}
                      </div>
                    </td>
                    <td>{firstItem?.cashEntry?.assetAccount ? <><strong>{firstItem.cashEntry.assetAccount.code}</strong><div className="subtle">{firstItem.cashEntry.assetAccount.name}</div></> : "-"}</td>
                    <td>{row.method}</td>
                    <td className="money green">{currency(row.totalAmount)}</td>
                    <td>{row.receivedBy}</td>
                    <td className="table-actions">
                      <div className="table-action-buttons">
                        <Link
                          aria-label="Cetak kwitansi"
                          className="btn-icon btn-create"
                          href={`/kwitansi/${row.id}`}
                          title="Cetak kwitansi"
                        >
                          <Printer size={15} />
                        </Link>
                        <Modal
                          size="xl"
                          title="Ubah Pembayaran"
                          trigger={
                            <button
                              aria-label="Ubah pembayaran"
                              className="btn-icon btn-edit"
                              title="Ubah pembayaran"
                              type="button"
                            >
                              <Pencil size={15} />
                            </button>
                          }
                        >
                          {editForm(row)}
                        </Modal>
                        <ConfirmDelete
                          action={deletePaymentReceipt}
                          id={row.id}
                          label="kwitansi pembayaran"
                        />
                      </div>
                    </td>
                  </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="empty" colSpan={9}>
                    Data pembayaran tidak ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={paginatedPaymentRows.currentPage} endItem={paginatedPaymentRows.endItem} pageSize={paginatedPaymentRows.pageSize} pathname="/transaksi/pembayaran" preserve={{ dir: sortDirection, q: query, sort: sortKey }} startItem={paginatedPaymentRows.startItem} totalItems={paginatedPaymentRows.totalItems} totalPages={paginatedPaymentRows.totalPages} />
      </section>
    </main>
  );
}
