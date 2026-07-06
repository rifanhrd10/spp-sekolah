import { PermissionKey } from "@prisma/client";
import { Pencil, Plus } from "lucide-react";
import {
  createExpenseCategory,
  deleteExpenseCategory,
  updateExpenseCategory,
} from "@/app/actions";
import { ConfirmDelete, Modal, ModalCancelButton } from "@/components/modal";
import { MasterDataToolbar } from "@/components/master-data-toolbar";
import { NoticeFromParams, type PageSearchParams } from "@/components/notice-from-params";
import { SortableTh } from "@/components/sortable-th";
import { TablePagination, TablePageSizeSelect } from "@/components/table-pagination";
import { TableSearch } from "@/components/table-search";
import { requirePermission } from "@/lib/auth";
import { paginateItems, readPageParam, readPageSizeParam } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";
import { compareValues, readSortDirectionParam, readSortKeyParam } from "@/lib/sort";

export default async function ExpenseCategoriesPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  await requirePermission(PermissionKey.MASTER_EXPENSE_CATEGORY);
  const params = await searchParams;
  const query = readSearchParam(params, "q");
  const page = readPageParam(params, "page");
  const pageSize = readPageSizeParam(params, "pageSize");
  const sortKey = readSortKeyParam(params, "sort", "name");
  const sortDirection = readSortDirectionParam(params, "dir", "asc");
  const [categories, accounts] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: { deletedAt: null },
      include: {
        expenseAccount: true,
        _count: { select: { expenses: true } },
      },
    }),
    prisma.account.findMany({
      where: { active: true, deletedAt: null, type: "BEBAN" },
      orderBy: { code: "asc" },
    }),
  ]);
  const filtered = categories.filter((item) =>
    matchesSearch(
      query,
      item.code,
      item.name,
      item.description,
      item.expenseAccount?.name,
    ),
  );
  const sorted = [...filtered].sort((left, right) => {
    switch (sortKey) {
      case "code":
        return compareValues(left.code, right.code, sortDirection);
      case "account":
        return compareValues(left.expenseAccount?.name, right.expenseAccount?.name, sortDirection);
      case "usage":
        return compareValues(left._count.expenses, right._count.expenses, sortDirection);
      case "status":
        return compareValues(left.active, right.active, sortDirection);
      default:
        return compareValues(left.name, right.name, sortDirection);
    }
  });
  const paginated = paginateItems(sorted, page, pageSize);

  const form = (item?: (typeof categories)[number]) => (
    <form action={item ? updateExpenseCategory : createExpenseCategory} className="form-stack">
      {item ? <input name="id" type="hidden" value={item.id} /> : null}
      <div className="field-grid">
        <label>
          Kode Kategori
          <input defaultValue={item?.code} name="code" placeholder="OPERASIONAL" required />
        </label>
        <label>
          Akun Beban
          <select defaultValue={item?.expenseAccountId ?? ""} name="expenseAccountId" required>
            <option value="">Pilih akun beban</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Nama Kategori
        <input defaultValue={item?.name} name="name" placeholder="Operasional Sekolah" required />
      </label>
      <label>
        Keterangan
        <textarea defaultValue={item?.description ?? ""} name="description" />
      </label>
      {item ? (
        <label>
          Status
          <select defaultValue={String(item.active)} name="active">
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </label>
      ) : null}
      <div className="form-actions">
        <ModalCancelButton />
        <button className={`btn ${item ? "btn-edit" : "btn-save"}`} type="submit">
          {item ? "Simpan Perubahan" : "Simpan Kategori"}
        </button>
      </div>
    </form>
  );

  return (
    <main className="page">
      <MasterDataToolbar
        actions={
          <Modal
            title="Tambah Kategori Pengeluaran"
            trigger={
              <button className="btn btn-create" type="button">
                <Plus size={17} /> Tambah Kategori
              </button>
            }
          >
            {form()}
          </Modal>
        }
      >
        <div className="table-toolbar-controls">
            <TableSearch placeholder="Cari kode, kategori, atau akun beban" query={query} />
            <TablePageSizeSelect
              pageSize={paginated.pageSize}
              pathname="/master/kategori-pengeluaran"
              preserve={{ dir: sortDirection, q: query, sort: sortKey }}
            />
        </div>
      </MasterDataToolbar>
      <NoticeFromParams searchParams={searchParams} />
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="table-number">No</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Kode" pathname="/master/kategori-pengeluaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="code" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Kategori" pathname="/master/kategori-pengeluaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="name" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Akun Beban" pathname="/master/kategori-pengeluaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="account" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Dipakai" pathname="/master/kategori-pengeluaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="usage" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Status" pathname="/master/kategori-pengeluaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="status" />
                <th className="table-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginated.items.length ? paginated.items.map((item, index) => (
                <tr key={item.id}>
                  <td className="table-number">{paginated.startItem + index}</td>
                  <td><strong>{item.code}</strong></td>
                  <td><strong>{item.name}</strong><div className="subtle">{item.description || "-"}</div></td>
                  <td>{item.expenseAccount ? `${item.expenseAccount.code} - ${item.expenseAccount.name}` : "5101 - Beban Operasional Sekolah"}</td>
                  <td>{item._count.expenses} transaksi</td>
                  <td><span className={`badge ${item.active ? "green" : "rose"}`}>{item.active ? "Aktif" : "Nonaktif"}</span></td>
                  <td className="table-actions">
                    <div className="table-action-buttons">
                      <Modal title="Ubah Kategori Pengeluaran" trigger={<button aria-label="Ubah kategori" className="btn-icon btn-edit" title="Ubah kategori" type="button"><Pencil size={15} /></button>}>
                        {form(item)}
                      </Modal>
                      <ConfirmDelete action={deleteExpenseCategory} id={item.id} label="kategori pengeluaran" />
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td className="empty" colSpan={7}>Kategori pengeluaran tidak ditemukan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={paginated.currentPage} endItem={paginated.endItem} pageSize={paginated.pageSize} pathname="/master/kategori-pengeluaran" preserve={{ dir: sortDirection, q: query, sort: sortKey }} startItem={paginated.startItem} totalItems={paginated.totalItems} totalPages={paginated.totalPages} />
      </section>
    </main>
  );
}
