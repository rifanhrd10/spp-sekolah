import { AccountType, CashType, PermissionKey } from "@prisma/client";
import { ArrowDownToLine, ArrowUpFromLine, Pencil, Plus } from "lucide-react";
import {
  createCashTransaction,
  deleteCashTransaction,
  updateCashTransaction,
} from "@/app/actions";
import { ConfirmDelete, Modal, ModalCancelButton } from "@/components/modal";
import { DateRangeFilter } from "@/components/date-range-filter";
import { MoneyInput } from "@/components/money-input";
import {
  NoticeFromParams,
  type PageSearchParams,
} from "@/components/notice-from-params";
import { TablePagination, TablePageSizeSelect } from "@/components/table-pagination";
import { SortableTh } from "@/components/sortable-th";
import { TableSearch } from "@/components/table-search";
import { TableSelectFilter } from "@/components/table-select-filter";
import { requirePermission } from "@/lib/auth";
import { currency, shortDate } from "@/lib/format";
import { isWithinDateRange, readDateParam } from "@/lib/date-range";
import { paginateItems, readPageParam, readPageSizeParam } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";
import { compareValues, readSortDirectionParam, readSortKeyParam } from "@/lib/sort";

function CashForm({
  action,
  assetAccounts,
  contraAccounts,
  entry,
}: {
  action: (formData: FormData) => Promise<void>;
  assetAccounts: { id: string; code: string; name: string }[];
  contraAccounts: { id: string; code: string; name: string }[];
  entry?: {
    id: string;
    type: CashType;
    date: Date;
    amount: number;
    description: string;
    reference: string | null;
    assetAccountId: string | null;
    contraAccountId: string | null;
  };
}) {
  return (
    <form action={action} className="form-stack">
      {entry ? <input name="id" type="hidden" value={entry.id} /> : null}
      <div className="field-grid">
        <label>
          Jenis
          <select
            defaultValue={entry?.type ?? CashType.MASUK}
            disabled={Boolean(entry)}
            name="type"
          >
            <option value={CashType.MASUK}>Kas Masuk</option>
            <option value={CashType.KELUAR}>Kas Keluar</option>
          </select>
          {entry ? (
            <input name="type" type="hidden" value={entry.type} />
          ) : null}
        </label>
        <label>
          Tanggal
          <input
            defaultValue={(entry?.date ?? new Date())
              .toISOString()
              .slice(0, 10)}
            name="date"
            required
            type="date"
          />
        </label>
      </div>
      <label>
        Keterangan
        <input
          defaultValue={entry?.description}
          name="description"
          placeholder="Keterangan transaksi"
          required
        />
      </label>
      <label>
        Nominal
        <MoneyInput defaultValue={entry?.amount} />
      </label>
      <div className="field-grid">
        <label>
          Kas / Bank
          <select defaultValue={entry?.assetAccountId ?? ""} name="assetAccountId" required>
            <option value="">Pilih kas / bank</option>
            {assetAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Akun Lawan
          <select defaultValue={entry?.contraAccountId ?? ""} name={entry ? "contraAccountId" : "accountId"} required>
            <option value="">Pilih akun lawan</option>
            {contraAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-actions">
        <ModalCancelButton />
        <button
          className={`btn ${entry ? "btn-edit" : "btn-save"}`}
          type="submit"
        >
          {entry ? "Simpan Perubahan" : "Simpan Transaksi"}
        </button>
      </div>
    </form>
  );
}

export default async function CashBookPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const user = await requirePermission(PermissionKey.CASHBOOK_VIEW);
  const params = await searchParams;
  const query = readSearchParam(params, "q");
  const page = readPageParam(params, "page");
  const pageSize = readPageSizeParam(params, "pageSize");
  const sortKey = readSortKeyParam(params, "sort", "date");
  const sortDirection = readSortDirectionParam(params, "dir", "desc");
  const from = readDateParam(params, "from");
  const to = readDateParam(params, "to");
  const assetAccountId = typeof params.assetAccountId === "string" ? params.assetAccountId : "";
  const canManage = user.permissions.includes(PermissionKey.CASHBOOK_MANAGE);
  const [entries, accounts] = await Promise.all([
    prisma.cashTransaction.findMany({
      where: { deletedAt: null },
      include: { assetAccount: true, contraAccount: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    prisma.account.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { code: "asc" },
    }),
  ]);
  const rangeEntries = entries.filter((item) => {
    if (!isWithinDateRange(item.date, from, to)) return false;
    if (!assetAccountId) return true;
    return item.assetAccountId === assetAccountId;
  });
  const filteredEntries = rangeEntries.filter((item) =>
    matchesSearch(
      query,
      item.description,
      item.type,
      item.createdBy,
      item.assetAccount?.code,
      item.assetAccount?.name,
    ),
  );
  const sortedEntries = [...filteredEntries].sort((left, right) => {
    switch (sortKey) {
      case "description":
        return compareValues(left.description, right.description, sortDirection);
      case "createdBy":
        return compareValues(left.createdBy, right.createdBy, sortDirection);
      case "in":
        return compareValues(left.type === CashType.MASUK ? left.amount : 0, right.type === CashType.MASUK ? right.amount : 0, sortDirection);
      case "out":
        return compareValues(left.type === CashType.KELUAR ? left.amount : 0, right.type === CashType.KELUAR ? right.amount : 0, sortDirection);
      default:
        return compareValues(left.date, right.date, sortDirection);
    }
  });
  const paginatedEntries = paginateItems(sortedEntries, page, pageSize);
  const assetAccounts = accounts.filter((account) => account.type === AccountType.ASET);
  const contraAccounts = accounts.filter((account) => account.type !== AccountType.ASET);
  const tablePreserve = { assetAccountId, from, pageSize: String(pageSize), q: query, to };
  const scopedEntries = assetAccountId
    ? entries.filter((item) => item.assetAccountId === assetAccountId)
    : entries;
  const totalIn = rangeEntries
    .filter((item) => item.type === CashType.MASUK)
    .reduce((sum, item) => sum + item.amount, 0);
  const totalOut = rangeEntries
    .filter((item) => item.type === CashType.KELUAR)
    .reduce((sum, item) => sum + item.amount, 0);
  const overallBalance = scopedEntries.reduce(
    (sum, item) => sum + (item.type === CashType.MASUK ? item.amount : -item.amount),
    0,
  );

  return (
    <main className="page">
      <section className="page-title">
        <div className="page-title-copy">
          <div className="table-toolbar-controls"><TableSearch placeholder="Cari keterangan, jenis transaksi, atau pencatat" preserve={{ assetAccountId, from, to }} query={query} /><TableSelectFilter allLabel="Semua kas / bank" options={assetAccounts.map((account) => ({ label: `${account.code} - ${account.name}`, value: account.id }))} preserve={{ from, q: query, sort: sortKey, to }} value={assetAccountId} valueKey="assetAccountId" /><TablePageSizeSelect pageSize={paginatedEntries.pageSize} pathname="/buku-kas" preserve={{ assetAccountId, dir: sortDirection, from, q: query, sort: sortKey, to }} /></div>
        </div>
        {canManage ? (
          <Modal
            title="Tambah Transaksi Kas"
            description="Transaksi manual otomatis membentuk jurnal seimbang."
            trigger={
              <button className="btn btn-create" type="button">
                <Plus size={17} /> Tambah Kas
              </button>
            }
          >
            <CashForm action={createCashTransaction} assetAccounts={assetAccounts} contraAccounts={contraAccounts} />
          </Modal>
        ) : null}
      </section>
      <NoticeFromParams searchParams={searchParams} />
      <DateRangeFilter from={from} pathname="/buku-kas" preserve={{ assetAccountId, q: query }} to={to} />
      <section className="summary-grid report">
        <div className="metric green">
          <span className="label">Total Kas Masuk</span>
          <strong>{currency(totalIn)}</strong>
          <div className="foot">
            <span>
              {rangeEntries.filter((e) => e.type === CashType.MASUK).length}{" "}
              transaksi
            </span>
            <ArrowDownToLine size={20} />
          </div>
        </div>
        <div className="metric rose">
          <span className="label">Total Kas Keluar</span>
          <strong>{currency(totalOut)}</strong>
          <div className="foot">
            <span>
              {rangeEntries.filter((e) => e.type === CashType.KELUAR).length}{" "}
              transaksi
            </span>
            <ArrowUpFromLine size={20} />
          </div>
        </div>
        <div className="metric cyan">
          <span className="label">Saldo Kas</span>
          <strong>{currency(totalIn - totalOut)}</strong>
          <div className="foot">
            <span>Saldo saat ini</span>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="table-number">No</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Tanggal" pathname="/buku-kas" preserve={tablePreserve} sortKey="date" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Keterangan" pathname="/buku-kas" preserve={tablePreserve} sortKey="description" />
                <th>Kas / Bank</th>
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Pengguna" pathname="/buku-kas" preserve={tablePreserve} sortKey="createdBy" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Kas Masuk" pathname="/buku-kas" preserve={tablePreserve} sortKey="in" />
                <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Kas Keluar" pathname="/buku-kas" preserve={tablePreserve} sortKey="out" />
                <th>Saldo</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginatedEntries.items.length ? (
                paginatedEntries.items.map((entry, index) => {
                  const entryIndex = scopedEntries.findIndex(
                    (item) => item.id === entry.id,
                  );
                  const newerMovement = scopedEntries
                    .slice(0, entryIndex)
                    .reduce(
                      (sum, item) =>
                        sum +
                        (item.type === CashType.MASUK
                          ? item.amount
                          : -item.amount),
                      0,
                    );
                  const balance = overallBalance - newerMovement;
                  const automatic = Boolean(entry.paymentId || entry.expenseId);
                  return (
                    <tr key={entry.id}>
                      <td className="table-number">{paginatedEntries.startItem + index}</td>
                      <td>{shortDate(entry.date)}</td>
                      <td>
                        <strong>{entry.description}</strong>
                        <div className="subtle">
                          {automatic
                            ? "Otomatis dari transaksi"
                            : `Dicatat ${entry.createdBy}`}
                        </div>
                      </td>
                      <td>{entry.assetAccount ? <><strong>{entry.assetAccount.code}</strong><div className="subtle">{entry.assetAccount.name}</div></> : "-"}</td>
                      <td>{entry.createdBy}</td>
                      <td className="money green">
                        {entry.type === CashType.MASUK
                          ? currency(entry.amount)
                          : "-"}
                      </td>
                      <td className="money rose">
                        {entry.type === CashType.KELUAR
                          ? currency(entry.amount)
                          : "-"}
                      </td>
                      <td className="money">{currency(balance)}</td>
                      <td>
                        {canManage && !automatic ? (
                          <div className="flex gap-2">
                            <Modal
                              title="Ubah Transaksi Kas"
                              trigger={
                                <button
                                  aria-label="Ubah transaksi kas"
                                  className="btn-icon btn-edit"
                                  title="Ubah transaksi kas"
                                  type="button"
                                >
                                  <Pencil size={15} />
                                </button>
                              }
                            >
                                <CashForm
                                  action={updateCashTransaction}
                                  assetAccounts={assetAccounts}
                                  contraAccounts={contraAccounts}
                                  entry={entry}
                                />
                              </Modal>
                            <ConfirmDelete
                              action={deleteCashTransaction}
                              id={entry.id}
                              label="transaksi kas"
                            />
                          </div>
                        ) : (
                          <span className="subtle">Terkunci</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="empty" colSpan={9}>
                    Data mutasi kas tidak ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={paginatedEntries.currentPage} endItem={paginatedEntries.endItem} pageSize={paginatedEntries.pageSize} pathname="/buku-kas" preserve={{ assetAccountId, dir: sortDirection, from, q: query, sort: sortKey, to }} startItem={paginatedEntries.startItem} totalItems={paginatedEntries.totalItems} totalPages={paginatedEntries.totalPages} />
      </section>
    </main>
  );
}
