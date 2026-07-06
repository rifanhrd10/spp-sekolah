import { AccountType, PermissionKey } from "@prisma/client";
import { FolderTree, Pencil, Plus, ReceiptText, WalletCards } from "lucide-react";
import { createExpense, deleteExpense, updateExpense } from "@/app/actions";
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
import { currency, shortDate } from "@/lib/format";
import { paginateItems, readPageParam, readPageSizeParam } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";
import { compareValues, readSortDirectionParam, readSortKeyParam } from "@/lib/sort";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const user = await requirePermission(PermissionKey.EXPENSE_MANAGE);
  const params = await searchParams;
  const query = readSearchParam(params, "q");
  const page = readPageParam(params, "page");
  const pageSize = readPageSizeParam(params, "pageSize");
  const sortKey = readSortKeyParam(params, "sort", "spentAt");
  const sortDirection = readSortDirectionParam(params, "dir", "desc");
  const [expenses, categories, assetAccounts] = await Promise.all([
    prisma.expense.findMany({
      where: { deletedAt: null },
      include: { cashEntry: { include: { assetAccount: true } }, categoryRef: true },
      orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.expenseCategory.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.account.findMany({
      where: { deletedAt: null, active: true, type: AccountType.ASET },
      orderBy: { code: "asc" },
    }),
  ]);
  const filteredExpenses = expenses.filter((item) =>
    matchesSearch(
      query,
      item.title,
      item.categoryRef?.name ?? item.categoryNameSnapshot ?? "-",
      item.vendor,
      item.note,
      item.createdBy,
      item.cashEntry?.assetAccount?.name,
      item.cashEntry?.assetAccount?.code,
    ),
  );
  const sortedExpenses = [...filteredExpenses].sort((left, right) => {
    switch (sortKey) {
      case "title":
        return compareValues(left.title, right.title, sortDirection);
      case "category":
        return compareValues(left.categoryRef?.name ?? left.categoryNameSnapshot ?? "-", right.categoryRef?.name ?? right.categoryNameSnapshot ?? "-", sortDirection);
      case "vendor":
        return compareValues(left.vendor, right.vendor, sortDirection);
      case "amount":
        return compareValues(left.amount, right.amount, sortDirection);
      case "createdBy":
        return compareValues(left.createdBy, right.createdBy, sortDirection);
      default:
        return compareValues(left.spentAt, right.spentAt, sortDirection);
    }
  });
  const paginatedExpenses = paginateItems(sortedExpenses, page, pageSize);
  const totalExpense = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const categoryCount = new Set(
    expenses.map((expense) => expense.categoryId ?? expense.categoryRef?.name ?? expense.categoryNameSnapshot ?? "-"),
  ).size;
  const latestExpense = expenses[0]?.spentAt;
  const form = (item?: (typeof expenses)[number]) => (
    <form action={item ? updateExpense : createExpense} className="form-stack">
      {item ? <input name="id" type="hidden" value={item.id} /> : null}
      <input name="createdBy" type="hidden" value={user.name} />
      <div className="field-grid">
        <label>
          Kategori
          <select defaultValue={item?.categoryId ?? ""} name="categoryId" required>
            <option value="">Pilih kategori</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label>
          Tanggal
          <input
            defaultValue={(item?.spentAt ?? new Date())
              .toISOString()
              .slice(0, 10)}
            name="spentAt"
            required
            type="date"
          />
        </label>
      </div>
      <label>
        Keperluan
        <input defaultValue={item?.title} name="title" required />
      </label>
      <div className="field-grid">
        <label>
          Nominal
          <MoneyInput defaultValue={item?.amount} />
        </label>
        <label>
          Kas / Bank
          <select defaultValue={item?.cashEntry?.assetAccountId ?? ""} name="assetAccountId" required>
            <option value="">Pilih kas / bank</option>
            {assetAccounts.map((account) => (
              <option key={account.id} value={account.id}>{account.code} - {account.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-grid">
        <label>
          Vendor
          <input defaultValue={item?.vendor ?? ""} name="vendor" />
        </label>
        <label>
          Catatan
          <input defaultValue={item?.note ?? ""} name="note" />
        </label>
      </div>
      <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
        Pengeluaran otomatis dicatat sebagai kas keluar dan jurnal beban.
      </div>
      <div className="form-actions">
        <ModalCancelButton />
        <button
          className={`btn ${item ? "btn-edit" : "btn-save"}`}
          type="submit"
        >
          {item ? "Simpan Perubahan" : "Simpan Pengeluaran"}
        </button>
      </div>
    </form>
  );
  return (
    <main className="page">
      <section className="page-title">
        <div className="page-title-copy">
          <div className="table-toolbar-controls"><TableSearch placeholder="Cari keperluan, kategori, vendor, catatan, atau petugas" query={query} /><TablePageSizeSelect pageSize={paginatedExpenses.pageSize} pathname="/transaksi/pengeluaran" preserve={{ dir: sortDirection, q: query, sort: sortKey }} /></div>
        </div>
        <Modal
          title="Tambah Pengeluaran"
          trigger={
            <button className="btn btn-create" type="button">
              <Plus size={17} /> Tambah Pengeluaran
            </button>
          }
        >
          {form()}
        </Modal>
      </section>
      <NoticeFromParams searchParams={searchParams} />
      <section className="summary-grid report">
        <div className="metric rose"><div><span className="label">Total Pengeluaran</span><strong>{currency(totalExpense)}</strong></div><div className="foot"><span>{expenses.length} transaksi</span><WalletCards size={20} /></div></div>
        <div className="metric"><div><span className="label">Kategori</span><strong>{categoryCount}</strong></div><div className="foot"><span>Master terhubung</span><FolderTree size={20} /></div></div>
        <div className="metric cyan"><div><span className="label">Pengeluaran Terakhir</span><strong>{latestExpense ? shortDate(latestExpense) : "-"}</strong></div><div className="foot"><span>Kas dan jurnal otomatis</span><ReceiptText size={20} /></div></div>
      </section>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="table-number">No</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Tanggal" pathname="/transaksi/pengeluaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="spentAt" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Keperluan" pathname="/transaksi/pengeluaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="title" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Kategori" pathname="/transaksi/pengeluaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="category" />
                <th>Kas / Bank</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Vendor" pathname="/transaksi/pengeluaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="vendor" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Nominal" pathname="/transaksi/pengeluaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="amount" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Petugas" pathname="/transaksi/pengeluaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="createdBy" />
                <th className="table-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginatedExpenses.items.length ? (
                paginatedExpenses.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="table-number">{paginatedExpenses.startItem + index}</td>
                    <td>{shortDate(item.spentAt)}</td>
                    <td>
                      <strong>{item.title}</strong>
                      <div className="subtle">{item.note || "-"}</div>
                    </td>
                    <td>{item.categoryRef?.name ?? item.categoryNameSnapshot ?? "-"}</td>
                    <td>{item.cashEntry?.assetAccount ? <><strong>{item.cashEntry.assetAccount.code}</strong><div className="subtle">{item.cashEntry.assetAccount.name}</div></> : "-"}</td>
                    <td>{item.vendor || "-"}</td>
                    <td className="money rose">{currency(item.amount)}</td>
                    <td>{item.createdBy}</td>
                    <td className="table-actions">
                      <div className="table-action-buttons">
                        <Modal
                          title="Ubah Pengeluaran"
                          trigger={
                            <button
                              aria-label="Ubah pengeluaran"
                              className="btn-icon btn-edit"
                              title="Ubah pengeluaran"
                              type="button"
                            >
                              <Pencil size={15} />
                            </button>
                          }
                        >
                          {form(item)}
                        </Modal>
                        <ConfirmDelete
                          action={deleteExpense}
                          id={item.id}
                          label="pengeluaran"
                        />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty" colSpan={9}>
                    Data pengeluaran tidak ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={paginatedExpenses.currentPage} endItem={paginatedExpenses.endItem} pageSize={paginatedExpenses.pageSize} pathname="/transaksi/pengeluaran" preserve={{ dir: sortDirection, q: query, sort: sortKey }} startItem={paginatedExpenses.startItem} totalItems={paginatedExpenses.totalItems} totalPages={paginatedExpenses.totalPages} />
      </section>
    </main>
  );
}
