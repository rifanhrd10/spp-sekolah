import { AccountType, PermissionKey } from "@prisma/client";
import {
  BookOpen,
  BookText,
  CircleDollarSign,
  ListTree,
  Pencil,
  Plus,
  Rows3,
  Scale,
} from "lucide-react";
import {
  createAccount,
  createJournalEntry,
  deleteAccount,
  updateAccount,
} from "@/app/actions";
import { ConfirmDelete, Modal, ModalCancelButton } from "@/components/modal";
import { DateRangeFilter } from "@/components/date-range-filter";
import { MoneyInput } from "@/components/money-input";
import { NoticeFromParams, type PageSearchParams } from "@/components/notice-from-params";
import { SortableTh } from "@/components/sortable-th";
import { TablePagination, TablePageSizeSelect } from "@/components/table-pagination";
import { TableSearch } from "@/components/table-search";
import { TableSelectFilter } from "@/components/table-select-filter";
import { WorkbookTabs } from "@/components/workbook-tabs";
import { requirePermission } from "@/lib/auth";
import { currency, shortDate } from "@/lib/format";
import { isWithinDateRange, readDateParam } from "@/lib/date-range";
import { paginateItems, readPageParam, readPageSizeParam } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";
import { compareValues, readSortDirectionParam, readSortKeyParam } from "@/lib/sort";

const sheets = [
  { key: "jurnal", label: "Jurnal Umum", description: "Catatan semua transaksi keuangan", icon: BookOpen },
  { key: "buku-besar", label: "Buku Besar", description: "Riwayat perpindahan nilai per akun", icon: Rows3 },
  { key: "neraca-saldo", label: "Neraca Saldo", description: "Ringkasan saldo setiap akun", icon: Scale },
  { key: "daftar-akun", label: "Daftar Akun", description: "Master kode rekening", icon: ListTree },
];

function accountBalance(type: AccountType, debit: number, credit: number) {
  return type === AccountType.ASET || type === AccountType.BEBAN
    ? debit - credit
    : credit - debit;
}

function journalSourceLabel(sourceType: string | null | undefined) {
  switch (sourceType) {
    case "PAYMENT":
      return "Otomatis dari pembayaran";
    case "EXPENSE":
      return "Otomatis dari pengeluaran";
    case "CASH":
      return "Otomatis dari buku kas";
    case "MANUAL":
      return "Jurnal penyesuaian manual";
    default:
      return "Jurnal umum";
  }
}

function journalSourceBadge(sourceType: string | null | undefined) {
  switch (sourceType) {
    case "PAYMENT":
      return "cyan";
    case "EXPENSE":
      return "rose";
    case "CASH":
      return "amber";
    case "MANUAL":
      return "green";
    default:
      return "cyan";
  }
}

export default async function AccountingPage({ searchParams }: { searchParams: PageSearchParams }) {
  const user = await requirePermission(PermissionKey.ACCOUNTING_VIEW);
  const params = await searchParams;
  const requestedSheet = typeof params.sheet === "string" ? params.sheet : "jurnal";
  const sheet = sheets.some((item) => item.key === requestedSheet) ? requestedSheet : "jurnal";
  const query = readSearchParam(params, "q");
  const page = readPageParam(params, "page");
  const pageSize = readPageSizeParam(params, "pageSize");
  const sortKey = readSortKeyParam(params, "sort", sheet === "daftar-akun" ? "code" : "date");
  const sortDirection = readSortDirectionParam(params, "dir", sheet === "daftar-akun" ? "asc" : "desc");
  const from = readDateParam(params, "from");
  const to = readDateParam(params, "to");
  const assetAccountId = typeof params.assetAccountId === "string" ? params.assetAccountId : "";
  const canManage = user.permissions.includes(PermissionKey.ACCOUNTING_MANAGE);
  const [accounts, journals] = await Promise.all([
    prisma.account.findMany({
      where: { deletedAt: null },
      include: {
        lines: true,
        _count: {
          select: {
            cashAssetEntries: true,
            cashContraEntries: true,
            expenseCategories: true,
            lines: true,
            paymentCategories: true,
          },
        },
      },
      orderBy: { code: "asc" },
    }),
    prisma.journalEntry.findMany({
      where: { deletedAt: null },
      include: { lines: { include: { account: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const assetAccounts = accounts.filter((account) => account.active && account.type === AccountType.ASET);
  const rangeJournals = journals.filter((journal) => {
    if (!isWithinDateRange(journal.date, from, to)) return false;
    if (!assetAccountId) return true;
    return journal.lines.some((line) => line.accountId === assetAccountId);
  });
  const ledgerRows = rangeJournals.flatMap((journal) =>
    journal.lines.map((line) => ({
      id: line.id,
      date: journal.date,
      number: journal.number,
      description: journal.description,
      accountCode: line.account.code,
      accountName: line.account.name,
      debit: line.debit,
      credit: line.credit,
      sourceType: journal.sourceType,
    })),
  );
  const balanceRows = accounts.map((account) => {
    const accountLines = rangeJournals.flatMap((journal) => journal.lines).filter((line) => line.accountId === account.id);
    const debit = accountLines.reduce((sum, line) => sum + line.debit, 0);
    const credit = accountLines.reduce((sum, line) => sum + line.credit, 0);
    return {
      ...account,
      debit,
      credit,
      balance: accountBalance(account.type, debit, credit),
    };
  });
  const automaticJournalCount = rangeJournals.filter((journal) => journal.sourceType && journal.sourceType !== "MANUAL").length;
  const manualJournalCount = rangeJournals.filter((journal) => journal.sourceType === "MANUAL").length;
  const activeAccountCount = accounts.filter((account) => account.active).length;
  const cashBalance = balanceRows
    .filter((row) => row.type === AccountType.ASET && (!assetAccountId || row.id === assetAccountId))
    .reduce((total, row) => total + row.balance, 0);
  const activeRows = sheet === "jurnal"
    ? rangeJournals.filter((journal) => matchesSearch(query, journal.number, journal.description, journal.sourceType, ...journal.lines.map((line) => `${line.account.code} ${line.account.name}`)))
    : sheet === "buku-besar"
      ? ledgerRows.filter((row) => matchesSearch(query, row.number, row.description, row.accountCode, row.accountName, row.sourceType))
      : balanceRows.filter((row) => matchesSearch(query, row.code, row.name, row.type));
  const sortedRows = [...activeRows].sort((left, right) => {
    const leftRecord = left as unknown as Record<string, unknown>;
    const rightRecord = right as unknown as Record<string, unknown>;
    if (sheet === "jurnal" && (sortKey === "debit" || sortKey === "credit")) {
      const leftValue = (left as typeof journals[number]).lines.reduce((sum, line) => sum + line[sortKey], 0);
      const rightValue = (right as typeof journals[number]).lines.reduce((sum, line) => sum + line[sortKey], 0);
      return compareValues(leftValue, rightValue, sortDirection);
    }
    return compareValues(
      leftRecord[sortKey] as string | number | boolean | Date | null | undefined,
      rightRecord[sortKey] as string | number | boolean | Date | null | undefined,
      sortDirection,
    );
  });
  const paginated = paginateItems(sortedRows, page, pageSize);
  const preserve = { assetAccountId, dir: sortDirection, from, q: query, sheet, sort: sortKey, to };
  const pathPreserve = { assetAccountId, from, pageSize: String(pageSize), q: query, sheet, to };
  const operationalAccountTypes = [AccountType.ASET, AccountType.PENDAPATAN, AccountType.BEBAN];
  const advancedAccountTypes = [AccountType.KEWAJIBAN, AccountType.MODAL];
  const canCreateManualJournal = canManage && user.role === "ADMIN";
  const accountUsageCount = (account: (typeof accounts)[number]) =>
    Object.values(account._count).reduce((total, count) => total + count, 0);

  const accountForm = (account?: (typeof accounts)[number]) => {
    const isUsed = account ? accountUsageCount(account) > 0 : false;
    return (
    <form action={account ? updateAccount : createAccount} className="form-stack">
      {account ? <input name="id" type="hidden" value={account.id} /> : null}
      <div className="field-grid">
        <label>Kode Akun<input defaultValue={account?.code} name="code" placeholder="1103" required /></label>
        <label>
          Jenis
          <select defaultValue={account?.type} disabled={isUsed} name="type">
            <optgroup label="Operasional">
              {operationalAccountTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </optgroup>
            <optgroup label="Lanjutan">
              {advancedAccountTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </optgroup>
          </select>
          {isUsed && account ? <input name="type" type="hidden" value={account.type} /> : null}
        </label>
      </div>
      <label>Nama Akun<input defaultValue={account?.name} name="name" required /></label>
      <div className="callout callout-blue">
        Gunakan jenis operasional untuk kebutuhan harian sekolah: aset untuk kas atau bank, pendapatan untuk pemasukan, dan beban untuk pengeluaran. Jenis lanjutan dipakai hanya untuk setup pembukuan khusus.
      </div>
      {account ? <label>Status<select defaultValue={String(account.active)} disabled={isUsed} name="active"><option value="true">Aktif</option><option value="false">Nonaktif</option></select>{isUsed ? <input name="active" type="hidden" value="true" /> : null}</label> : null}
      <div className="form-actions"><ModalCancelButton /><button className={`btn ${account ? "btn-edit" : "btn-save"}`} type="submit">{account ? "Simpan Perubahan" : "Simpan Akun"}</button></div>
    </form>
    );
  };

  const manualJournalForm = (
    <form action={createJournalEntry} className="form-stack">
      <div className="callout callout-blue">
        Jurnal manual dipakai hanya untuk penyesuaian khusus yang belum tercatat dari pembayaran, pengeluaran, atau buku kas.
      </div>
      <div className="field-grid">
        <label>Tanggal<input defaultValue={new Date().toISOString().slice(0, 10)} name="date" required type="date" /></label>
        <label>Nominal<MoneyInput /></label>
      </div>
      <label>Keterangan<input name="description" placeholder="Contoh: Penyesuaian saldo awal" required /></label>
      <div className="field-grid">
        <label>
          Akun Debit
          <select defaultValue="" name="debitAccountId" required>
            <option disabled value="">Pilih akun debit</option>
            {accounts.filter((account) => account.active).map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
          </select>
        </label>
        <label>
          Akun Kredit
          <select defaultValue="" name="creditAccountId" required>
            <option disabled value="">Pilih akun kredit</option>
            {accounts.filter((account) => account.active).map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
          </select>
        </label>
      </div>
      <div className="form-actions"><ModalCancelButton /><button className="btn btn-save" type="submit">Posting Jurnal</button></div>
    </form>
  );

  return (
    <main className="page workbook-page">
      <div className="workbook-tabs-bar">
        <WorkbookTabs active={sheet} pathname="/akuntansi" tabs={sheets} />
        {canManage ? (
          <div className="workbook-tabs-actions">
            <Modal title="Tambah Akun" trigger={<button className="btn btn-secondary" type="button"><Plus size={17} /> Akun</button>}>{accountForm()}</Modal>
          </div>
        ) : null}
      </div>
      <NoticeFromParams searchParams={searchParams} />
      <section className="accounting-overview-grid">
        <article className="accounting-overview-card">
          <div className="accounting-overview-icon"><ListTree size={18} /></div>
          <div><span>Akun Aktif</span><strong>{activeAccountCount}</strong><small>Master akun untuk kas, pendapatan, dan beban</small></div>
        </article>
        <article className="accounting-overview-card">
          <div className="accounting-overview-icon"><BookText size={18} /></div>
          <div><span>Jurnal Otomatis</span><strong>{automaticJournalCount}</strong><small>Dibentuk dari pembayaran, pengeluaran, dan buku kas</small></div>
        </article>
        <article className="accounting-overview-card">
          <div className="accounting-overview-icon"><CircleDollarSign size={18} /></div>
          <div><span>Saldo Kas</span><strong>{currency(cashBalance)}</strong><small>Posisi akun kas sekolah pada rentang tanggal aktif</small></div>
        </article>
      </section>
      <div className="callout callout-blue accounting-callout">
        Jurnal di modul ini bersifat otomatis dari transaksi utama sekolah. Bendahara cukup fokus ke pembayaran, pengeluaran, dan buku kas. Pada periode ini ada {manualJournalCount} jurnal penyesuaian manual, dan fitur tersebut hanya dipakai untuk kasus khusus.
      </div>
      {sheet === "jurnal" || sheet === "buku-besar" || sheet === "neraca-saldo" ? (
        <section className="accounting-journal-guide">
          <div className="accounting-journal-guide-copy">
            <strong>{sheet === "buku-besar" ? "Cara baca buku besar" : sheet === "neraca-saldo" ? "Cara baca neraca saldo" : "Cara baca jurnal umum"}</strong>
            <span>
              {sheet === "buku-besar"
                ? "Buku besar menampilkan riwayat perpindahan nilai per akun. Badge warna menunjukkan sumber transaksi agar bendahara bisa cepat tahu data itu berasal dari pembayaran, pengeluaran, buku kas, atau jurnal manual."
                : sheet === "neraca-saldo"
                  ? "Neraca saldo merangkum total debit, kredit, dan saldo akun pada periode aktif. Tampilan ini cocok dipakai untuk cek keseimbangan pembukuan sekolah."
                  : "Debit menunjukkan akun yang menerima pencatatan di sisi kiri. Kredit menunjukkan akun lawannya. Nilai debit dan kredit untuk satu transaksi harus seimbang."}
            </span>
          </div>
          <div className="accounting-journal-guide-badges">
            <span className="badge cyan">Pembayaran</span>
            <span className="badge rose">Pengeluaran</span>
            <span className="badge amber">Buku Kas</span>
            <span className="badge green">Manual</span>
          </div>
        </section>
      ) : null}
      {sheet !== "daftar-akun" ? <DateRangeFilter from={from} pathname="/akuntansi" preserve={{ assetAccountId, q: query, sheet }} to={to} /> : null}
      <section className="panel workbook-sheet">
        <div className="sheet-toolbar">
          <div className="table-toolbar-controls">
            <TableSearch placeholder={`Cari ${sheets.find((item) => item.key === sheet)?.label.toLowerCase()}`} preserve={{ assetAccountId, from, sheet, to }} query={query} />
            {sheet !== "daftar-akun" ? (
              <TableSelectFilter
                allLabel="Semua kas / bank"
                options={assetAccounts.map((account) => ({ label: `${account.code} - ${account.name}`, value: account.id }))}
                preserve={{ from, q: query, sheet, sort: sortKey, to }}
                value={assetAccountId}
                valueKey="assetAccountId"
              />
            ) : null}
            <TablePageSizeSelect pageSize={paginated.pageSize} pathname="/akuntansi" preserve={preserve} />
          </div>
          <div className="sheet-toolbar-meta">
            {sheet === "jurnal" && canCreateManualJournal ? (
              <Modal title="Jurnal Penyesuaian" trigger={<button className="btn btn-secondary" type="button"><Plus size={17} /> Jurnal Penyesuaian</button>}>
                {manualJournalForm}
              </Modal>
            ) : null}
          </div>
        </div>
        <div className="table-wrap">
          {sheet === "jurnal" ? (
            <table><thead><tr>
              <th className="table-number">No</th>
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Tanggal / Nomor" pathname="/akuntansi" preserve={pathPreserve} sortKey="date" />
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Keterangan" pathname="/akuntansi" preserve={pathPreserve} sortKey="description" />
              <th>Akun</th>
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Debit" pathname="/akuntansi" preserve={pathPreserve} sortKey="debit" />
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Kredit" pathname="/akuntansi" preserve={pathPreserve} sortKey="credit" />
            </tr></thead><tbody>
              {(paginated.items as typeof journals).length ? (paginated.items as typeof journals).flatMap((journal, journalIndex) => journal.lines.map((line, index) => (
                <tr key={line.id}>
                  <td className="table-number">{index === 0 ? paginated.startItem + journalIndex : null}</td>
                  <td>{index === 0 ? <><strong>{shortDate(journal.date)}</strong><div className="subtle">{journal.number}</div></> : null}</td>
                  <td>{index === 0 ? <><strong>{journal.description}</strong><div className="subtle journal-source-note"><span className={`badge ${journalSourceBadge(journal.sourceType)}`}>{journalSourceLabel(journal.sourceType)}</span></div></> : null}</td>
                  <td>{line.account.code} - {line.account.name}</td>
                  <td className="money">{line.debit ? currency(line.debit) : "-"}</td>
                  <td className="money">{line.credit ? currency(line.credit) : "-"}</td>
                </tr>
              ))) : <tr><td className="empty" colSpan={6}>Belum ada jurnal pada periode dan filter yang dipilih.</td></tr>}
            </tbody></table>
          ) : sheet === "buku-besar" ? (
            <table><thead><tr>
              <th className="table-number">No</th>
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Tanggal" pathname="/akuntansi" preserve={pathPreserve} sortKey="date" />
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Akun" pathname="/akuntansi" preserve={pathPreserve} sortKey="accountCode" />
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Nomor / Keterangan" pathname="/akuntansi" preserve={pathPreserve} sortKey="number" />
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Debit" pathname="/akuntansi" preserve={pathPreserve} sortKey="debit" />
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Kredit" pathname="/akuntansi" preserve={pathPreserve} sortKey="credit" />
            </tr></thead><tbody>{(paginated.items as typeof ledgerRows).length ? (paginated.items as typeof ledgerRows).map((row, index) => <tr key={row.id}><td className="table-number">{paginated.startItem + index}</td><td>{shortDate(row.date)}</td><td><strong>{row.accountCode}</strong><div className="subtle">{row.accountName}</div></td><td><strong>{row.number}</strong><div className="subtle">{row.description}</div><div className="subtle journal-source-note"><span className={`badge ${journalSourceBadge(row.sourceType)}`}>{journalSourceLabel(row.sourceType)}</span></div></td><td className="money">{row.debit ? currency(row.debit) : "-"}</td><td className="money">{row.credit ? currency(row.credit) : "-"}</td></tr>) : <tr><td className="empty" colSpan={6}>Belum ada mutasi buku besar pada filter yang dipilih.</td></tr>}</tbody></table>
          ) : sheet === "neraca-saldo" ? (
            <table><thead><tr>
              <th className="table-number">No</th>
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Kode" pathname="/akuntansi" preserve={pathPreserve} sortKey="code" />
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Nama Akun" pathname="/akuntansi" preserve={pathPreserve} sortKey="name" />
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Jenis" pathname="/akuntansi" preserve={pathPreserve} sortKey="type" />
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Total Debit" pathname="/akuntansi" preserve={pathPreserve} sortKey="debit" />
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Total Kredit" pathname="/akuntansi" preserve={pathPreserve} sortKey="credit" />
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Saldo" pathname="/akuntansi" preserve={pathPreserve} sortKey="balance" />
            </tr></thead><tbody>{(paginated.items as typeof balanceRows).length ? (paginated.items as typeof balanceRows).map((row, index) => <tr key={row.id}><td className="table-number">{paginated.startItem + index}</td><td><strong>{row.code}</strong></td><td>{row.name}</td><td>{row.type}</td><td className="money">{currency(row.debit)}</td><td className="money">{currency(row.credit)}</td><td className="money"><strong>{currency(row.balance)}</strong></td></tr>) : <tr><td className="empty" colSpan={7}>Belum ada saldo akun pada filter yang dipilih.</td></tr>}</tbody>
              <tfoot><tr><td colSpan={4}><strong>TOTAL</strong></td><td className="money"><strong>{currency(balanceRows.reduce((sum, row) => sum + row.debit, 0))}</strong></td><td className="money"><strong>{currency(balanceRows.reduce((sum, row) => sum + row.credit, 0))}</strong></td><td /></tr></tfoot>
            </table>
          ) : (
            <table><thead><tr>
              <th className="table-number">No</th>
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Kode" pathname="/akuntansi" preserve={pathPreserve} sortKey="code" />
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Nama Akun" pathname="/akuntansi" preserve={pathPreserve} sortKey="name" />
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Jenis" pathname="/akuntansi" preserve={pathPreserve} sortKey="type" />
              <SortableTh activeSortDirection={sortDirection} activeSortKey={sortKey} label="Saldo" pathname="/akuntansi" preserve={pathPreserve} sortKey="balance" />
              <th>Status</th><th>Aksi</th>
            </tr></thead><tbody>{(paginated.items as typeof balanceRows).length ? (paginated.items as typeof balanceRows).map((row, index) => <tr key={row.id}><td className="table-number">{paginated.startItem + index}</td><td><strong>{row.code}</strong></td><td>{row.name}</td><td>{row.type}</td><td className="money">{currency(row.balance)}</td><td><span className={`badge ${row.active ? "green" : "rose"}`}>{row.active ? "Aktif" : "Nonaktif"}</span></td><td className="table-actions">{canManage ? <div className="table-action-buttons"><Modal title="Ubah Akun" trigger={<button aria-label="Ubah akun" className="btn-icon btn-edit" title="Ubah akun" type="button"><Pencil size={15} /></button>}>{accountForm(row)}</Modal>{accountUsageCount(row) === 0 ? <ConfirmDelete action={deleteAccount} id={row.id} label="akun" /> : null}</div> : null}</td></tr>) : <tr><td className="empty" colSpan={7}>Belum ada akun yang sesuai dengan pencarian.</td></tr>}</tbody></table>
          )}
        </div>
        <TablePagination currentPage={paginated.currentPage} endItem={paginated.endItem} pageSize={paginated.pageSize} pathname="/akuntansi" preserve={preserve} startItem={paginated.startItem} totalItems={paginated.totalItems} totalPages={paginated.totalPages} />
      </section>
    </main>
  );
}
