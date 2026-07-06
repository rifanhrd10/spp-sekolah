import { AccountType, PaymentType, PermissionKey } from "@prisma/client";
import { Pencil, Plus } from "lucide-react";
import {
  createPaymentCategory,
  deletePaymentCategory,
  updatePaymentCategory,
} from "@/app/actions";
import { ConfirmDelete, Modal, ModalCancelButton } from "@/components/modal";
import { MasterDataToolbar } from "@/components/master-data-toolbar";
import { MoneyInput } from "@/components/money-input";
import {
  NoticeFromParams,
  type PageSearchParams,
} from "@/components/notice-from-params";
import { TablePagination, TablePageSizeSelect } from "@/components/table-pagination";
import { SortableTh } from "@/components/sortable-th";
import { TableSearch } from "@/components/table-search";
import { requirePermission } from "@/lib/auth";
import { currency, paymentTypeLabel } from "@/lib/format";
import { paginateItems, readPageParam, readPageSizeParam } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";
import { compareValues, readSortDirectionParam, readSortKeyParam } from "@/lib/sort";

export default async function PaymentCategoriesPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  await requirePermission(PermissionKey.MASTER_PAYMENT);
  const params = await searchParams;
  const query = readSearchParam(params, "q");
  const page = readPageParam(params, "page");
  const pageSize = readPageSizeParam(params, "pageSize");
  const sortKey = readSortKeyParam(params, "sort", "name");
  const sortDirection = readSortDirectionParam(params, "dir", "asc");
  const categories = await prisma.paymentCategory.findMany({
    where: { deletedAt: null },
    include: { revenueAccount: true },
    orderBy: { name: "asc" },
  });
  const revenueAccounts = await prisma.account.findMany({
    where: { deletedAt: null, active: true, type: AccountType.PENDAPATAN },
    orderBy: [{ code: "asc" }],
  });
  const filteredCategories = categories.filter((item) =>
    matchesSearch(
      query,
      item.name,
      paymentTypeLabel(item.code),
      item.description,
      item.defaultAmount,
      item.revenueAccount?.code,
      item.revenueAccount?.name,
    ),
  );
  const sortedCategories = [...filteredCategories].sort((left, right) => {
    switch (sortKey) {
      case "code":
        return compareValues(paymentTypeLabel(left.code), paymentTypeLabel(right.code), sortDirection);
      case "amount":
        return compareValues(left.defaultAmount, right.defaultAmount, sortDirection);
      case "account":
        return compareValues(
          `${left.revenueAccount?.code ?? ""} ${left.revenueAccount?.name ?? ""}`,
          `${right.revenueAccount?.code ?? ""} ${right.revenueAccount?.name ?? ""}`,
          sortDirection,
        );
      case "description":
        return compareValues(left.description, right.description, sortDirection);
      case "status":
        return compareValues(left.active, right.active, sortDirection);
      default:
        return compareValues(left.name, right.name, sortDirection);
    }
  });
  const paginatedCategories = paginateItems(sortedCategories, page, pageSize);
  const form = (item?: (typeof categories)[number]) => (
    <form
      action={item ? updatePaymentCategory : createPaymentCategory}
      className="form-stack"
    >
      {item ? <input name="id" type="hidden" value={item.id} /> : null}
      <div className="field-grid">
        <label>
          Kode
          <select
            defaultValue={item?.code}
            disabled={Boolean(item)}
            name="code"
          >
            {Object.values(PaymentType).map((type) => (
              <option key={type} value={type}>
                {paymentTypeLabel(type)}
              </option>
            ))}
          </select>
          {item ? <input name="code" type="hidden" value={item.code} /> : null}
        </label>
        <label>
          Nominal Default
          <MoneyInput defaultValue={item?.defaultAmount} name="defaultAmount" />
        </label>
      </div>
      <label>
        Nama
        <input
          defaultValue={item?.name}
          name="name"
          placeholder="SPP Bulanan"
          required
        />
      </label>
      <label>
        Akun Pendapatan
        <select defaultValue={item?.revenueAccountId ?? ""} name="revenueAccountId" required>
          <option value="">Pilih akun pendapatan</option>
          {revenueAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.code} - {account.name}
            </option>
          ))}
        </select>
      </label>
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
          {item ? "Simpan Perubahan" : "Simpan Jenis"}
        </button>
      </div>
    </form>
  );
  return (
    <main className="page">
      <MasterDataToolbar
        actions={
          <Modal
            title="Tambah Jenis Pembayaran"
            trigger={
              <button className="btn btn-create" type="button">
                <Plus size={17} /> Tambah Jenis
              </button>
            }
          >
            {form()}
          </Modal>
        }
      >
        <div className="table-toolbar-controls">
            <TableSearch
              placeholder="Cari jenis, kode, nominal, atau keterangan"
              query={query}
            />
            <TablePageSizeSelect pageSize={paginatedCategories.pageSize} pathname="/master/jenis-pembayaran" preserve={{ dir: sortDirection, q: query, sort: sortKey }} />
        </div>
      </MasterDataToolbar>
      <NoticeFromParams searchParams={searchParams} />
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="table-number">No</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Jenis" pathname="/master/jenis-pembayaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="name" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Kode" pathname="/master/jenis-pembayaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="code" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Default" pathname="/master/jenis-pembayaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="amount" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Akun Pendapatan" pathname="/master/jenis-pembayaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="account" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Keterangan" pathname="/master/jenis-pembayaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="description" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Status" pathname="/master/jenis-pembayaran" preserve={{ pageSize: String(pageSize), q: query }} sortKey="status" />
                <th className="table-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCategories.items.length ? (
                paginatedCategories.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="table-number">{paginatedCategories.startItem + index}</td>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>{paymentTypeLabel(item.code)}</td>
                    <td className="money">{currency(item.defaultAmount)}</td>
                    <td>{item.revenueAccount ? <><strong>{item.revenueAccount.code}</strong><div className="subtle">{item.revenueAccount.name}</div></> : <span className="subtle">Pendapatan umum</span>}</td>
                    <td>{item.description || "-"}</td>
                    <td>
                      <span
                        className={`badge ${item.active ? "green" : "rose"}`}
                      >
                        {item.active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="table-actions">
                      <div className="table-action-buttons">
                        <Modal
                          title="Ubah Jenis Pembayaran"
                          trigger={
                            <button
                              aria-label="Ubah jenis pembayaran"
                              className="btn-icon btn-edit"
                              title="Ubah jenis pembayaran"
                              type="button"
                            >
                              <Pencil size={15} />
                            </button>
                          }
                        >
                          {form(item)}
                        </Modal>
                        <ConfirmDelete
                          action={deletePaymentCategory}
                          id={item.id}
                          label="jenis pembayaran"
                        />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty" colSpan={8}>
                    Data jenis pembayaran tidak ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={paginatedCategories.currentPage} endItem={paginatedCategories.endItem} pageSize={paginatedCategories.pageSize} pathname="/master/jenis-pembayaran" preserve={{ dir: sortDirection, q: query, sort: sortKey }} startItem={paginatedCategories.startItem} totalItems={paginatedCategories.totalItems} totalPages={paginatedCategories.totalPages} />
      </section>
    </main>
  );
}
