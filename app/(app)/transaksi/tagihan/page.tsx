import { PermissionKey } from "@prisma/client";
import { Banknote, Layers3, Pencil, Plus, ReceiptText, WalletCards } from "lucide-react";
import Link from "next/link";
import { createBulkInvoices, createInvoice, deleteInvoice, updateInvoice } from "@/app/actions";
import { ConfirmDelete, Modal, ModalCancelButton } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import {
  NoticeFromParams,
  type PageSearchParams,
} from "@/components/notice-from-params";
import { TablePagination, TablePageSizeSelect } from "@/components/table-pagination";
import { SortableTh } from "@/components/sortable-th";
import { TableSearch } from "@/components/table-search";
import { requirePermission } from "@/lib/auth";
import {
  currency,
  paymentTypeLabel,
  shortDate,
  statusLabel,
} from "@/lib/format";
import { paidTotal, remainingTotal } from "@/lib/finance";
import { paginateItems, readPageParam, readPageSizeParam } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";
import { compareValues, readSortDirectionParam, readSortKeyParam } from "@/lib/sort";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  await requirePermission(PermissionKey.INVOICE_MANAGE);
  const params = await searchParams;
  const query = readSearchParam(params, "q");
  const page = readPageParam(params, "page");
  const pageSize = readPageSizeParam(params, "pageSize");
  const sortKey = readSortKeyParam(params, "sort", "title");
  const sortDirection = readSortDirectionParam(params, "dir", "desc");
  const [students, categories, invoices] = await Promise.all([
    prisma.student.findMany({
      include: { classRoom: true },
      where: { active: true, deletedAt: null },
      orderBy: [{ classRoom: { level: "asc" } }, { classRoom: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.paymentCategory.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null },
      include: {
        billingBatch: { include: { classRoom: true } },
        paymentCategory: true,
        student: { include: { classRoom: true } },
        payments: { where: { deletedAt: null }, select: { amount: true } },
      },
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const filteredInvoices = invoices.filter((item) =>
    matchesSearch(
      query,
      item.title,
      item.student.name,
      item.student.classRoom?.name ?? item.student.classNameSnapshot,
      paymentTypeLabel(item.type),
      statusLabel(item.status),
    ),
  );
  const sortedInvoices = [...filteredInvoices].sort((left, right) => {
    switch (sortKey) {
      case "type":
        return compareValues(paymentTypeLabel(left.type), paymentTypeLabel(right.type), sortDirection);
      case "dueDate":
        return compareValues(left.dueDate, right.dueDate, sortDirection);
      case "amount":
        return compareValues(left.amount, right.amount, sortDirection);
      case "paid":
        return compareValues(paidTotal(left), paidTotal(right), sortDirection);
      case "remaining":
        return compareValues(remainingTotal(left), remainingTotal(right), sortDirection);
      case "status":
        return compareValues(statusLabel(left.status), statusLabel(right.status), sortDirection);
      default:
        return compareValues(`${left.title} ${left.student.name}`, `${right.title} ${right.student.name}`, sortDirection);
    }
  });
  const paginatedInvoices = paginateItems(sortedInvoices, page, pageSize);
  const totalBilled = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const totalPaid = invoices.reduce((sum, invoice) => sum + paidTotal(invoice), 0);
  const totalRemaining = invoices.reduce((sum, invoice) => sum + remainingTotal(invoice), 0);
  const openInvoices = invoices.filter((invoice) => remainingTotal(invoice) > 0).length;
  const form = (item?: (typeof invoices)[number]) => (
    <form action={item ? updateInvoice : createInvoice} className="form-stack">
      {item ? <input name="id" type="hidden" value={item.id} /> : null}
      <label>
        Siswa
        <select defaultValue={item?.studentId ?? ""} name="studentId" required>
          <option value="">Pilih siswa</option>
              {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name} - {student.classRoom?.name ?? student.classNameSnapshot ?? "-"}
              </option>
            ))}
        </select>
      </label>
      <div className="field-grid">
        <label>
          Jenis Pembayaran
          <select defaultValue={item?.paymentCategoryId ?? categories.find((category) => category.code === item?.type)?.id ?? ""} name="paymentCategoryId" required>
            <option value="">Pilih jenis pembayaran</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} - {currency(category.defaultAmount)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Jatuh Tempo
          <input
            defaultValue={item?.dueDate.toISOString().slice(0, 10)}
            name="dueDate"
            required
            type="date"
          />
        </label>
      </div>
      <label>
        Nama Tagihan
        <input
          defaultValue={item?.title}
          name="title"
          placeholder="SPP Agustus 2026"
          required
        />
      </label>
      <label>
        Nominal
        <MoneyInput defaultValue={item?.amount} />
      </label>
      <div className="field-grid">
        <label>
          Tahun Ajaran
          <input defaultValue={item?.academicYear ?? "2026/2027"} name="academicYear" required />
        </label>
        <label>
          Periode
          <input defaultValue={item?.period ?? new Date().toISOString().slice(0, 7)} name="period" placeholder="2026-07" required />
        </label>
      </div>
      <label>
        Keterangan
        <textarea defaultValue={item?.description ?? ""} name="description" />
      </label>
      <div className="form-actions">
        <ModalCancelButton />
        <button
          className={`btn ${item ? "btn-edit" : "btn-save"}`}
          type="submit"
        >
          {item ? "Simpan Perubahan" : "Simpan Tagihan"}
        </button>
      </div>
    </form>
  );
  const bulkForm = (
    <form action={createBulkInvoices} className="form-stack">
      <div className="callout callout-blue">
        <strong>Satu kali proses untuk maksimal {students.length} siswa aktif.</strong>
        <span>Pilih semua kelas atau satu kelas. Sistem membuat tagihan per siswa dan otomatis melewati duplikat jenis pembayaran pada periode yang sama.</span>
      </div>
      <div className="field-grid">
        <label>
          Sasaran
          <select name="classRoomId" required>
            <option value="ALL">Semua kelas aktif</option>
            {Array.from(new Map(
              students
                .filter((student) => student.classRoomId && student.classRoom)
                .map((student) => [student.classRoomId as string, student.classRoom?.name ?? student.classNameSnapshot ?? "-"]),
            ).entries())
              .map(([id, name]) => [name, id] as const)
              .filter((entry): entry is [string, string] => Boolean(entry[1]))
              .map(([name, id]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label>
          Jenis Pembayaran
          <select name="paymentCategoryId" required>
            <option value="">Pilih jenis pembayaran</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name} - {currency(category.defaultAmount)}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Nama Tagihan
        <input name="title" placeholder="SPP Agustus 2026" required />
      </label>
      <div className="field-grid">
        <label>
          Nominal per Siswa
          <MoneyInput placeholder="250.000" />
        </label>
        <label>
          Jatuh Tempo
          <input name="dueDate" required type="date" />
        </label>
      </div>
      <div className="field-grid">
        <label>
          Tahun Ajaran
          <input defaultValue="2026/2027" name="academicYear" required />
        </label>
        <label>
          Periode Unik
          <input defaultValue={new Date().toISOString().slice(0, 7)} name="period" placeholder="2026-08" required />
        </label>
      </div>
      <label>
        Keterangan
        <textarea name="description" />
      </label>
      <div className="form-actions">
        <ModalCancelButton />
        <button className="btn btn-save" type="submit">Buat Tagihan Massal</button>
      </div>
    </form>
  );
  return (
    <main className="page">
      <section className="page-title">
        <div className="page-title-copy">
          <div className="table-toolbar-controls"><TableSearch placeholder="Cari tagihan, siswa, kelas, jenis, atau status" query={query} /><TablePageSizeSelect pageSize={paginatedInvoices.pageSize} pathname="/transaksi/tagihan" preserve={{ dir: sortDirection, q: query, sort: sortKey }} /></div>
        </div>
        <div className="page-actions">
          <Modal
            description="Buat satu jenis tagihan untuk satu kelas atau seluruh siswa aktif."
            size="lg"
            title="Buat Tagihan Massal"
            trigger={<button className="btn btn-secondary" type="button"><Layers3 size={17} /> Tagihan Massal</button>}
          >
            {bulkForm}
          </Modal>
          <Modal
            title="Tambah Tagihan Individual"
            trigger={<button className="btn btn-create" type="button"><Plus size={17} /> Tagihan Individual</button>}
          >
            {form()}
          </Modal>
        </div>
      </section>
      <NoticeFromParams searchParams={searchParams} />
      <section className="summary-grid report">
        <div className="metric"><div><span className="label">Total Tagihan</span><strong>{currency(totalBilled)}</strong></div><div className="foot"><span>{invoices.length} tagihan</span><ReceiptText size={20} /></div></div>
        <div className="metric green"><div><span className="label">Terbayar</span><strong>{currency(totalPaid)}</strong></div><div className="foot"><span>Sudah masuk kas</span><Banknote size={20} /></div></div>
        <div className="metric amber"><div><span className="label">Sisa Tagihan</span><strong>{currency(totalRemaining)}</strong></div><div className="foot"><span>{openInvoices} belum lunas</span><WalletCards size={20} /></div></div>
      </section>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="table-number">No</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Tagihan / Siswa" pathname="/transaksi/tagihan" preserve={{ pageSize: String(pageSize), q: query }} sortKey="title" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Jenis" pathname="/transaksi/tagihan" preserve={{ pageSize: String(pageSize), q: query }} sortKey="type" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Tempo" pathname="/transaksi/tagihan" preserve={{ pageSize: String(pageSize), q: query }} sortKey="dueDate" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Nominal" pathname="/transaksi/tagihan" preserve={{ pageSize: String(pageSize), q: query }} sortKey="amount" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Terbayar" pathname="/transaksi/tagihan" preserve={{ pageSize: String(pageSize), q: query }} sortKey="paid" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Sisa" pathname="/transaksi/tagihan" preserve={{ pageSize: String(pageSize), q: query }} sortKey="remaining" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Status" pathname="/transaksi/tagihan" preserve={{ pageSize: String(pageSize), q: query }} sortKey="status" />
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginatedInvoices.items.length ? (
                paginatedInvoices.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="table-number">{paginatedInvoices.startItem + index}</td>
                    <td>
                      <strong>{item.title}</strong>
                      <div className="subtle">
                        <Link className="inline-link" href={`/master/siswa?classId=${item.student.classRoomId ?? ""}&q=${encodeURIComponent(item.student.name)}`}>{item.student.name} - {item.student.classRoom?.name ?? item.student.classNameSnapshot ?? "-"}</Link>
                        {item.billingBatch ? ` · ${item.billingBatch.classRoom?.name ?? item.billingBatch.targetLabelSnapshot ?? "Semua Kelas"}` : ""}
                      </div>
                    </td>
                    <td>{item.paymentCategory?.name ?? paymentTypeLabel(item.type)}</td>
                    <td>{shortDate(item.dueDate)}</td>
                    <td className="money">{currency(item.amount)}</td>
                    <td className="money green">{currency(paidTotal(item))}</td>
                    <td className="money amber">
                      {currency(remainingTotal(item))}
                    </td>
                    <td>
                      <span
                        className={`badge ${item.status === "LUNAS" ? "green" : "amber"}`}
                      >
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <Modal
                          title="Ubah Tagihan"
                          trigger={
                            <button
                              aria-label="Ubah tagihan"
                              className="btn-icon btn-edit"
                              title="Ubah tagihan"
                              type="button"
                            >
                              <Pencil size={15} />
                            </button>
                          }
                        >
                          {form(item)}
                        </Modal>
                        <ConfirmDelete
                          action={deleteInvoice}
                          id={item.id}
                          label="tagihan"
                        />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty" colSpan={9}>
                    Data tagihan tidak ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={paginatedInvoices.currentPage} endItem={paginatedInvoices.endItem} pageSize={paginatedInvoices.pageSize} pathname="/transaksi/tagihan" preserve={{ dir: sortDirection, q: query, sort: sortKey }} startItem={paginatedInvoices.startItem} totalItems={paginatedInvoices.totalItems} totalPages={paginatedInvoices.totalPages} />
      </section>
    </main>
  );
}
