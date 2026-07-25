import { AccountType, PermissionKey } from "@prisma/client";
import { FolderTree, Pencil, Plus, ReceiptText, WalletCards } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteExpenseReceipt, updateExpenseReceipt } from "@/app/actions";
import { ExpenseEntry } from "@/components/expense-entry";
import { DateRangeFilter } from "@/components/date-range-filter";
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
import { isWithinDateRange, readDateParam } from "@/lib/date-range";
import { currency, shortDate } from "@/lib/format";
import { paginateItems, readPageParam, readPageSizeParam } from "@/lib/pagination";
import { getAllowedExpenseCategoryIds } from "@/lib/permissions";
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
  const categoryId = typeof params.categoryId === "string" ? params.categoryId : "";
  const from = readDateParam(params, "from");
  const to = readDateParam(params, "to");
  const allowedExpenseCategoryIds = await getAllowedExpenseCategoryIds(user.role);
  const allowedCategoryFilter = allowedExpenseCategoryIds === null ? {} : { id: { in: allowedExpenseCategoryIds } };
  const [categories, assetAccounts] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: { active: true, deletedAt: null, ...allowedCategoryFilter },
      orderBy: { name: "asc" },
    }),
    prisma.account.findMany({
      where: { deletedAt: null, active: true, type: AccountType.ASET },
      orderBy: { code: "asc" },
    }),
  ]);
  const selectedCategory = categories.find((category) => category.id === categoryId);
  if (categoryId && !selectedCategory) {
    redirect("/transaksi/pengeluaran?notice=Akses kategori pengeluaran tersebut tidak tersedia.&noticeType=error");
  }

  if (!categoryId) {
    return (
      <main className="page">
        <NoticeFromParams searchParams={searchParams} />
        <section className="panel empty-state-panel">
          <div className="empty-state-icon">
            <WalletCards size={26} />
          </div>
          <div>
            <h2>Pilih kategori pengeluaran</h2>
            <p>
              Data pengeluaran sekarang dipisah per kategori. Buka salah satu submenu kategori pengeluaran di sidebar
              untuk melihat tabel, membuat nota, dan memakai filter tanggal.
            </p>
          </div>
          {categories.length ? (
            <div className="category-link-grid">
              {categories.map((category) => (
                <Link
                  className="category-link-card"
                  href={`/transaksi/pengeluaran?categoryId=${encodeURIComponent(category.id)}`}
                  key={category.id}
                >
                  <FolderTree size={18} />
                  <span>{category.name}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="empty-inline">Belum ada kategori pengeluaran yang dapat diakses role ini.</p>
          )}
        </section>
      </main>
    );
  }

  const expenses = await prisma.expense.findMany({
    where: {
      deletedAt: null,
      categoryId: selectedCategory!.id,
    },
    include: { cashEntry: { include: { assetAccount: true } }, categoryRef: true },
    orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
  });
  const dateFilteredExpenses = expenses.filter((expense) => isWithinDateRange(expense.spentAt, from, to));
  type ExpenseItem = (typeof expenses)[number];
  const expenseRows = Array.from(
    dateFilteredExpenses.reduce((map, item) => {
      const key = item.receiptNo ?? item.id;
      const existing = map.get(key) ?? {
        id: item.id,
        receiptNo: item.receiptNo,
        spentAt: item.spentAt,
        createdBy: item.createdBy,
        items: [] as ExpenseItem[],
        totalAmount: 0,
      };
      existing.items.push(item);
      existing.totalAmount += item.amount;
      if (item.spentAt > existing.spentAt) existing.spentAt = item.spentAt;
      map.set(key, existing);
      return map;
    }, new Map<string, { id: string; receiptNo: string | null; spentAt: Date; createdBy: string; items: ExpenseItem[]; totalAmount: number }>()),
  ).map(([, row]) => row);
  const filteredExpenseRows = expenseRows.filter((row) =>
    matchesSearch(
      query,
      row.receiptNo,
      row.items.map((item) => item.title).join(" "),
      row.items.map((item) => item.categoryRef?.name ?? item.categoryNameSnapshot ?? "-").join(" "),
      row.items.map((item) => item.vendor ?? "").join(" "),
      row.items.map((item) => item.note ?? "").join(" "),
      row.createdBy,
      row.items[0]?.cashEntry?.assetAccount?.name,
      row.items[0]?.cashEntry?.assetAccount?.code,
    ),
  );
  const sortedExpenseRows = [...filteredExpenseRows].sort((left, right) => {
    switch (sortKey) {
      case "title":
        return compareValues(left.items.map((item) => item.title).join(" "), right.items.map((item) => item.title).join(" "), sortDirection);
      case "category":
        return compareValues(left.items.map((item) => item.categoryRef?.name ?? item.categoryNameSnapshot ?? "-").join(" "), right.items.map((item) => item.categoryRef?.name ?? item.categoryNameSnapshot ?? "-").join(" "), sortDirection);
      case "vendor":
        return compareValues(left.items.map((item) => item.vendor ?? "").join(" "), right.items.map((item) => item.vendor ?? "").join(" "), sortDirection);
      case "amount":
        return compareValues(left.totalAmount, right.totalAmount, sortDirection);
      case "createdBy":
        return compareValues(left.createdBy, right.createdBy, sortDirection);
      default:
        return compareValues(left.spentAt, right.spentAt, sortDirection);
    }
  });
  const paginatedExpenseRows = paginateItems(sortedExpenseRows, page, pageSize);
  const filteredTotalExpense = dateFilteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const latestExpense = dateFilteredExpenses[0]?.spentAt;
  const preserve = { categoryId, dir: sortDirection, from, q: query, sort: sortKey, to };
  const pathPreserve = { categoryId, from, pageSize: String(pageSize), q: query, to };
  const returnParams = new URLSearchParams();
  for (const [key, value] of Object.entries({ categoryId, dir: sortDirection, from, pageSize: String(pageSize), q: query, sort: sortKey, to })) {
    if (value) returnParams.set(key, value);
  }
  const returnTo = `/transaksi/pengeluaran${returnParams.size ? `?${returnParams.toString()}` : ""}`;
  const form = (row: (typeof expenseRows)[number]) => (
    <form action={updateExpenseReceipt} className="form-stack">
      <input name="returnTo" type="hidden" value={returnTo} />
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <strong>{row.receiptNo || "-"}</strong>
        <div>{row.items.length} item pengeluaran</div>
      </div>
      <div className="field-grid">
        <label>
          Tanggal
          <input
            defaultValue={row.spentAt
              .toISOString()
              .slice(0, 10)}
            name="spentAt"
            required
            type="date"
          />
        </label>
        <label>
          Kas / Bank
          <select defaultValue={row.items[0]?.cashEntry?.assetAccountId ?? ""} name="assetAccountId" required>
            <option value="">Pilih kas / bank</option>
            {assetAccounts.map((account) => (
              <option key={account.id} value={account.id}>{account.code} - {account.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="batch-lines">
        {row.items.map((item, index) => (
          <section className="batch-line selected" key={item.id}>
            <input name="id" type="hidden" value={item.id} />
            <div className="batch-line-head">
              <strong>Item {index + 1}</strong>
            </div>
            <div className="field-grid">
              {selectedCategory ? (
                <label>
                  Kategori
                  <input name="categoryId" type="hidden" value={selectedCategory.id} />
                  <div className="readonly-field">{selectedCategory.name}</div>
                </label>
              ) : (
                <label>
                  Kategori
                  <select defaultValue={item.categoryId ?? ""} name="categoryId" required>
                    <option value="">Pilih kategori</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Nominal
                <MoneyInput defaultValue={item.amount} name="amount" />
              </label>
            </div>
            <label>
              Keperluan
              <input defaultValue={item.title} name="title" required />
            </label>
            <div className="field-grid">
              <label>
                Vendor
                <input defaultValue={item.vendor ?? ""} name="vendor" />
              </label>
              <label>
                Catatan
                <input defaultValue={item.note ?? ""} name="note" />
              </label>
            </div>
          </section>
        ))}
      </div>
      <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
        Pengeluaran otomatis dicatat sebagai kas keluar dan jurnal beban.
      </div>
      <div className="form-actions">
        <ModalCancelButton />
        <button
          className="btn btn-edit"
          type="submit"
        >
          Simpan Perubahan
        </button>
      </div>
    </form>
  );
  return (
    <main className="page">
      <section className="page-title">
        <div className="page-title-copy">
          <div className="table-toolbar-controls transaction-toolbar-controls">
            <TablePageSizeSelect pageSize={paginatedExpenseRows.pageSize} pathname="/transaksi/pengeluaran" preserve={preserve} />
            <TableSearch placeholder={`Cari ${selectedCategory ? selectedCategory.name.toLowerCase() : "nota, keperluan, kategori, vendor, catatan, atau petugas"}`} preserve={{ categoryId, from, to }} query={query} />
            <DateRangeFilter from={from} pathname="/transaksi/pengeluaran" preserve={{ categoryId, q: query, sort: sortKey, dir: sortDirection }} to={to} />
          </div>
        </div>
        <Modal
          size="xl"
          title={selectedCategory ? `Tambah Pengeluaran ${selectedCategory.name}` : "Tambah Pengeluaran"}
          trigger={
            <button className="btn btn-create" type="button">
              <Plus size={17} /> {selectedCategory ? `Tambah ${selectedCategory.name}` : "Tambah Pengeluaran"}
            </button>
          }
        >
          <ExpenseEntry
            assetAccounts={assetAccounts.map((account) => ({ id: account.id, code: account.code, name: account.name }))}
            categories={categories.map((category) => ({ id: category.id, name: category.name }))}
            createdBy={user.name}
            fixedCategory={selectedCategory ? { id: selectedCategory.id, name: selectedCategory.name } : undefined}
            returnTo={returnTo}
          />
        </Modal>
      </section>
      <NoticeFromParams searchParams={searchParams} />
      <section className="summary-grid report">
        <div className="metric rose"><div><span className="label">Total Pengeluaran</span><strong>{currency(filteredTotalExpense)}</strong></div><div className="foot"><span>{expenseRows.length} nota · {dateFilteredExpenses.length} item</span><WalletCards size={20} /></div></div>
        <div className="metric cyan"><div><span className="label">Pengeluaran Terakhir</span><strong>{latestExpense ? shortDate(latestExpense) : "-"}</strong></div><div className="foot"><span>Kas dan jurnal otomatis</span><ReceiptText size={20} /></div></div>
      </section>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="table-number">No</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="No. Nota / Tanggal" pathname="/transaksi/pengeluaran" preserve={pathPreserve} sortKey="spentAt" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Keperluan" pathname="/transaksi/pengeluaran" preserve={pathPreserve} sortKey="title" />
                <th>Kas / Bank</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Vendor" pathname="/transaksi/pengeluaran" preserve={pathPreserve} sortKey="vendor" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Nominal" pathname="/transaksi/pengeluaran" preserve={pathPreserve} sortKey="amount" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Petugas" pathname="/transaksi/pengeluaran" preserve={pathPreserve} sortKey="createdBy" />
                <th className="table-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginatedExpenseRows.items.length ? (
                paginatedExpenseRows.items.map((row, index) => {
                  const firstItem = row.items[0];
                  return (
                  <tr key={row.receiptNo ?? row.id}>
                    <td className="table-number">{paginatedExpenseRows.startItem + index}</td>
                    <td>
                      <strong>{row.receiptNo || "-"}</strong>
                      <div className="subtle">{shortDate(row.spentAt)}</div>
                    </td>
                    <td>
                      <strong>{row.items.length > 1 ? `${row.items.length} item pengeluaran` : firstItem?.title}</strong>
                      <div className="subtle">{row.items.map((item) => item.title).join(", ")}</div>
                    </td>
                    <td>{firstItem?.cashEntry?.assetAccount ? <><strong>{firstItem.cashEntry.assetAccount.code}</strong><div className="subtle">{firstItem.cashEntry.assetAccount.name}</div></> : "-"}</td>
                    <td>{Array.from(new Set(row.items.map((item) => item.vendor).filter(Boolean))).join(", ") || "-"}</td>
                    <td className="money rose">{currency(row.totalAmount)}</td>
                    <td>{row.createdBy}</td>
                    <td className="table-actions">
                      <div className="table-action-buttons">
                        <Modal
                          size="xl"
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
                          {form(row)}
                        </Modal>
                        <ConfirmDelete
                          action={deleteExpenseReceipt}
                          hiddenFields={{ returnTo }}
                          id={row.id}
                          label="nota pengeluaran"
                        />
                      </div>
                    </td>
                  </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="empty" colSpan={8}>
                    Data pengeluaran tidak ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={paginatedExpenseRows.currentPage} endItem={paginatedExpenseRows.endItem} pageSize={paginatedExpenseRows.pageSize} pathname="/transaksi/pengeluaran" preserve={preserve} startItem={paginatedExpenseRows.startItem} totalItems={paginatedExpenseRows.totalItems} totalPages={paginatedExpenseRows.totalPages} />
      </section>
    </main>
  );
}
