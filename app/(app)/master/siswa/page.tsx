import { PermissionKey } from "@prisma/client";
import {
  Download,
  Eye,
  Pencil,
  Plus,
  ReceiptText,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { createStudent, deleteStudent, updateStudent } from "@/app/actions";
import { ConfirmDelete, Modal, ModalCancelButton } from "@/components/modal";
import { MasterDataToolbar } from "@/components/master-data-toolbar";
import { NisnInput } from "@/components/nisn-input";
import {
  NoticeFromParams,
  type PageSearchParams,
} from "@/components/notice-from-params";
import { SortableTh } from "@/components/sortable-th";
import {
  TablePagination,
  TablePageSizeSelect,
} from "@/components/table-pagination";
import { TableSearch } from "@/components/table-search";
import { requirePermission } from "@/lib/auth";
import { paidTotal, remainingTotal } from "@/lib/finance";
import {
  currency,
  paymentTypeLabel,
  shortDate,
  statusLabel,
} from "@/lib/format";
import {
  paginateItems,
  readPageParam,
  readPageSizeParam,
} from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";
import {
  compareValues,
  readSortDirectionParam,
  readSortKeyParam,
} from "@/lib/sort";
import {
  latestClassSnapshot,
  latestGraduationYear,
} from "@/lib/student-history";

function readParam(params: Awaited<PageSearchParams>, key: string) {
  const value = params[key];
  return typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value[0]
      : "";
}

const classLevelOrder = ["VII", "VIII", "IX"];

function compareClassLevel(left: string, right: string) {
  const leftIndex = classLevelOrder.indexOf(left);
  const rightIndex = classLevelOrder.indexOf(right);
  const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
  const normalizedRight =
    rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

  if (normalizedLeft !== normalizedRight)
    return normalizedLeft - normalizedRight;
  return left.localeCompare(right, "id");
}

function readRosterView(params: Awaited<PageSearchParams>) {
  const value = readParam(params, "view");
  return value === "all" || value === "alumni" ? value : "active";
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  await requirePermission(PermissionKey.MASTER_STUDENT);
  const params = await searchParams;
  const query = readSearchParam(params, "q");
  const page = readPageParam(params, "page");
  const pageSize = readPageSizeParam(params, "pageSize");
  const requestedSortKey = readSortKeyParam(params, "sort", "name");
  const sortDirection = readSortDirectionParam(params, "dir", "asc");
  const requestedClassId = readParam(params, "classId");
  const rosterView = readRosterView(params);
  const graduationYearFilter = readParam(params, "graduationYear");
  const finalClassFilter = readParam(params, "finalClass");
  const [students, classRows] = await Promise.all([
    prisma.student.findMany({
      where: { deletedAt: null },
      include: {
        classHistory: { orderBy: { movedAt: "asc" } },
        classRoom: true,
        invoices: {
          where: { deletedAt: null },
          include: {
            paymentCategory: true,
            payments: {
              where: { deletedAt: null },
              orderBy: { paidAt: "desc" },
              select: { amount: true, paidAt: true, receiptNo: true },
            },
          },
          orderBy: { dueDate: "desc" },
        },
      },
      orderBy: [
        { classRoom: { level: "asc" } },
        { classRoom: { name: "asc" } },
        { name: "asc" },
      ],
    }),
    prisma.classRoom.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: "asc" },
    }),
  ]);
  const classes = [...classRows].sort((left, right) => {
    const levelComparison = compareClassLevel(left.level, right.level);
    if (levelComparison !== 0) return levelComparison;
    return left.name.localeCompare(right.name, "id");
  });
  const selectedClassId = classes.some((room) => room.id === requestedClassId)
    ? requestedClassId
    : (classes[0]?.id ?? "");
  const classGroups = classes.reduce<Map<string, typeof classes>>(
    (grouped, room) => {
      grouped.set(room.level, [...(grouped.get(room.level) ?? []), room]);
      return grouped;
    },
    new Map<string, typeof classes>(),
  );
  const classSummaries = classes.map((room) => {
    const roomStudents = students.filter(
      (student) => student.classRoomId === room.id && student.active,
    );
    const billed = roomStudents.reduce(
      (sum, student) =>
        sum +
        student.invoices.reduce(
          (invoiceSum, invoice) => invoiceSum + invoice.amount,
          0,
        ),
      0,
    );
    const paid = roomStudents.reduce(
      (sum, student) =>
        sum +
        student.invoices.reduce(
          (invoiceSum, invoice) => invoiceSum + paidTotal(invoice),
          0,
        ),
      0,
    );
    return {
      room,
      students: roomStudents.length,
      billed,
      paid,
      remaining: Math.max(billed - paid, 0),
    };
  });
  const selectedSummary = classSummaries.find(
    (summary) => summary.room.id === selectedClassId,
  );
  const activeStudents = students.filter(
    (student) => student.active && student.promotionStatus !== "LULUS",
  );
  const alumniStudents = students.filter(
    (student) => !student.active || student.promotionStatus === "LULUS",
  );
  const today = new Date();
  const summarizeInvoiceTitles = (titles: string[]) => {
    if (!titles.length) return "Belum ada tagihan.";
    if (titles.length === 1) return titles[0];
    if (titles.length === 2) return `${titles[0]}, ${titles[1]}`;
    return `${titles[0]}, ${titles[1]} +${titles.length - 2} lagi`;
  };
  const resolveBillingStatus = (student: (typeof students)[number]) => {
    const unpaidInvoices = student.invoices.filter(
      (invoice) => remainingTotal(invoice) > 0,
    );
    const overdueInvoices = unpaidInvoices.filter(
      (invoice) => invoice.dueDate < today,
    );
    const installmentInvoices = unpaidInvoices.filter(
      (invoice) => paidTotal(invoice) > 0,
    );

    if (!student.invoices.length) {
      return {
        tone: "cyan",
        label: "Belum ditagih",
        note: "Belum ada tagihan yang dibuat.",
        unpaidInvoices,
        sortRank: 0,
      };
    }

    if (!unpaidInvoices.length) {
      return {
        tone: "green",
        label: "Lunas",
        note: `${student.invoices.length} tagihan sudah lunas.`,
        unpaidInvoices,
        sortRank: 3,
      };
    }

    if (overdueInvoices.length) {
      return {
        tone: "rose",
        label:
          overdueInvoices.length > 1
            ? `${overdueInvoices.length} menunggak`
            : "Menunggak",
        note: summarizeInvoiceTitles(
          overdueInvoices.map((invoice) => invoice.title),
        ),
        unpaidInvoices,
        sortRank: 1,
      };
    }

    if (installmentInvoices.length) {
      return {
        tone: "amber",
        label:
          installmentInvoices.length > 1
            ? `${installmentInvoices.length} cicilan`
            : "Cicilan",
        note: summarizeInvoiceTitles(
          unpaidInvoices.map((invoice) => invoice.title),
        ),
        unpaidInvoices,
        sortRank: 2,
      };
    }

    return {
      tone: "amber",
      label:
        unpaidInvoices.length > 1
          ? `${unpaidInvoices.length} belum lunas`
          : "Belum lunas",
      note: summarizeInvoiceTitles(
        unpaidInvoices.map((invoice) => invoice.title),
      ),
      unpaidInvoices,
      sortRank: 2,
    };
  };
  const billingStatusByStudentId = new Map(
    students.map((student) => [student.id, resolveBillingStatus(student)]),
  );
  const alumniLatestYear = alumniStudents.reduce((latest, student) => {
    const year = latestGraduationYear(student);
    if (year === "-") return latest;
    return latest === "-" || year > latest ? year : latest;
  }, "-");
  const alumniYears = Array.from(
    new Set(
      alumniStudents
        .map((student) => latestGraduationYear(student))
        .filter((value) => value !== "-"),
    ),
  ).sort((left, right) => right.localeCompare(left, "id"));
  const alumniClasses = Array.from(
    new Set(
      alumniStudents
        .map((student) => latestClassSnapshot(student))
        .filter((value) => value !== "-"),
    ),
  ).sort((left, right) => compareClassLevel(left, right));
  const sortKey =
    rosterView === "alumni" || requestedSortKey !== "graduation"
      ? requestedSortKey
      : "name";
  const baseStudents =
    rosterView === "alumni"
      ? alumniStudents
      : rosterView === "all"
        ? students
        : activeStudents;
  const isActiveGlobalSearch = rosterView === "active" && Boolean(query);
  const filteredStudents = baseStudents.filter(
    (item) =>
      (rosterView !== "active" ||
        isActiveGlobalSearch ||
        item.classRoomId === selectedClassId) &&
      (rosterView !== "alumni" ||
        !graduationYearFilter ||
        latestGraduationYear(item) === graduationYearFilter) &&
      (rosterView !== "alumni" ||
        !finalClassFilter ||
        latestClassSnapshot(item) === finalClassFilter) &&
      matchesSearch(
        query,
        item.name,
        item.nisn,
        item.guardianName,
        item.phone,
        item.gender,
        billingStatusByStudentId.get(item.id)?.label ?? "",
        billingStatusByStudentId.get(item.id)?.note ?? "",
        item.classRoom?.name ??
          item.classNameSnapshot ??
          latestClassSnapshot(item),
        rosterView !== "active" ? latestGraduationYear(item) : "",
      ),
  );
  const sortedStudents = [...filteredStudents].sort((left, right) => {
    const leftBilled = left.invoices.reduce(
      (sum, invoice) => sum + invoice.amount,
      0,
    );
    const rightBilled = right.invoices.reduce(
      (sum, invoice) => sum + invoice.amount,
      0,
    );
    const leftPaid = left.invoices.reduce(
      (sum, invoice) => sum + paidTotal(invoice),
      0,
    );
    const rightPaid = right.invoices.reduce(
      (sum, invoice) => sum + paidTotal(invoice),
      0,
    );
    switch (sortKey) {
      case "guardian":
        return compareValues(
          left.guardianName,
          right.guardianName,
          sortDirection,
        );
      case "graduation":
        return compareValues(
          latestGraduationYear(left),
          latestGraduationYear(right),
          sortDirection,
        );
      case "billed":
        return compareValues(leftBilled, rightBilled, sortDirection);
      case "remaining":
        return compareValues(
          leftBilled - leftPaid,
          rightBilled - rightPaid,
          sortDirection,
        );
      case "status": {
        const leftStatus = billingStatusByStudentId.get(left.id);
        const rightStatus = billingStatusByStudentId.get(right.id);
        const rankComparison = compareValues(
          leftStatus?.sortRank ?? 0,
          rightStatus?.sortRank ?? 0,
          sortDirection,
        );
        if (rankComparison !== 0) return rankComparison;
        return compareValues(
          leftStatus?.label ?? "",
          rightStatus?.label ?? "",
          sortDirection,
        );
      }
      default:
        return compareValues(left.name, right.name, sortDirection);
    }
  });
  const paginatedStudents = paginateItems(sortedStudents, page, pageSize);
  const classPreserve = {
    classId: selectedClassId,
    dir: sortDirection,
    q: query,
    sort: sortKey,
    view: rosterView,
  };
  const tablePreserve = {
    classId: selectedClassId,
    pageSize: String(pageSize),
    q: query,
    view: rosterView,
  };
  const showClassBrowser = rosterView === "active";
  const alumniExportParams = new URLSearchParams({
    view: "alumni",
    q: query,
  });
  if (graduationYearFilter)
    alumniExportParams.set("graduationYear", graduationYearFilter);
  if (finalClassFilter) alumniExportParams.set("finalClass", finalClassFilter);
  const returnParams = new URLSearchParams({
    classId: selectedClassId,
    pageSize: String(pageSize),
    view: rosterView,
  });
  if (query) returnParams.set("q", query);
  if (sortKey) returnParams.set("sort", sortKey);
  if (sortDirection) returnParams.set("dir", sortDirection);
  if (graduationYearFilter)
    returnParams.set("graduationYear", graduationYearFilter);
  if (finalClassFilter) returnParams.set("finalClass", finalClassFilter);
  const studentReturnTo = `/master/siswa?${returnParams.toString()}`;

  const form = (item?: (typeof students)[number]) => (
    <form
      action={item ? updateStudent : createStudent}
      className="form-stack student-form"
    >
      {item ? <input name="id" type="hidden" value={item.id} /> : null}
      <input name="returnTo" type="hidden" value={studentReturnTo} />
      <div className="student-form-grid">
        <label className="student-form-field">
          <span>NISN</span>
          <NisnInput defaultValue={item?.nisn} excludeId={item?.id} />
        </label>
        {item ? (
          <label className="student-form-field">
            <span>Kelas</span>
            <input
              className="student-form-readonly"
              defaultValue={
                item.classRoom?.name ??
                item.classNameSnapshot ??
                latestClassSnapshot(item)
              }
              readOnly
              tabIndex={-1}
            />
          </label>
        ) : (
          <label className="student-form-field">
            <span>Kelas</span>
            <select defaultValue="" name="classRoomId" required>
              <option disabled value="">
                Pilih kelas
              </option>
              {classes.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="student-form-field student-form-field-full">
        <span>Nama Siswa</span>
        <input defaultValue={item?.name} name="name" required />
      </label>
      <label className="student-form-field">
        <span>Jenis Kelamin</span>
        <select defaultValue={item?.gender ?? ""} name="gender">
          <option value="">Belum diisi</option>
          <option value="L">Laki-laki</option>
          <option value="P">Perempuan</option>
        </select>
      </label>
      <div className="student-form-grid">
        <label className="student-form-field">
          <span>Wali Murid</span>
          <input
            defaultValue={item?.guardianName}
            name="guardianName"
            required
          />
        </label>
        <label className="student-form-field">
          <span>Telepon</span>
          <input
            defaultValue={item?.phone ?? ""}
            inputMode="numeric"
            name="phone"
            pattern="[0-9]*"
            placeholder="Contoh: 081234567890"
          />
        </label>
      </div>
      <div className="form-actions">
        <ModalCancelButton />
        <button
          className={`btn ${item ? "btn-edit" : "btn-save"}`}
          type="submit"
        >
          {item ? "Simpan Perubahan" : "Simpan Siswa"}
        </button>
      </div>
    </form>
  );

  const detail = (item: (typeof students)[number]) => {
    const billed = item.invoices.reduce(
      (sum, invoice) => sum + invoice.amount,
      0,
    );
    const paid = item.invoices.reduce(
      (sum, invoice) => sum + paidTotal(invoice),
      0,
    );
    const remaining = Math.max(billed - paid, 0);
    const billingStatus = billingStatusByStudentId.get(item.id)!;
    const hasAttentionItems = billingStatus.unpaidInvoices.length > 0;
    const latestPayments = item.invoices
      .flatMap((invoice) =>
        invoice.payments.map((payment) => ({
          id: payment.receiptNo ?? payment.paidAt.toISOString(),
          title: invoice.title,
          category:
            invoice.paymentCategory?.name ?? paymentTypeLabel(invoice.type),
          amount: payment.amount,
          paidAt: payment.paidAt,
          receiptNo: payment.receiptNo,
        })),
      )
      .sort((left, right) => right.paidAt.getTime() - left.paidAt.getTime())
      .slice(0, 5);
    return (
      <div className="student-detail">
        <div className="student-finance-strip">
          <div>
            <span>Total Tagihan</span>
            <strong>{currency(billed)}</strong>
          </div>
          <div>
            <span>Terbayar</span>
            <strong>{currency(paid)}</strong>
          </div>
          <div>
            <span>Sisa</span>
            <strong>{currency(remaining)}</strong>
          </div>
          <div>
            <span>Tagihan Aktif</span>
            <strong>{billingStatus.unpaidInvoices.length}</strong>
          </div>
        </div>
        {hasAttentionItems || latestPayments.length ? (
          <div className="student-detail-columns">
            {hasAttentionItems ? (
              <section className="student-detail-panel">
                <div className="student-detail-panel-head">
                  <span>Perlu Perhatian</span>
                  <strong>{`${billingStatus.unpaidInvoices.length} tagihan aktif`}</strong>
                </div>
                <div className="student-focus-list">
                  {billingStatus.unpaidInvoices.map((invoice) => (
                    <article className="student-focus-item" key={invoice.id}>
                      <div>
                        <strong>{invoice.title}</strong>
                        <small>
                          {invoice.paymentCategory?.name ??
                            paymentTypeLabel(invoice.type)}{" "}
                          · Tempo {shortDate(invoice.dueDate)}
                        </small>
                      </div>
                      <div className="student-focus-money">
                        <span
                          className={`badge ${invoice.dueDate < today ? "rose" : "amber"}`}
                        >
                          {invoice.dueDate < today
                            ? "Lewat tempo"
                            : "Belum lunas"}
                        </span>
                        <strong>{currency(remainingTotal(invoice))}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
            {latestPayments.length ? (
              <section className="student-detail-panel">
                <div className="student-detail-panel-head">
                  <span>Pembayaran Terakhir</span>
                  <strong>{`${latestPayments.length} transaksi terbaru`}</strong>
                </div>
                <div className="student-focus-list">
                  {latestPayments.map((payment) => (
                    <article className="student-focus-item" key={payment.id}>
                      <div>
                        <strong>{payment.title}</strong>
                        <small>
                          {payment.category} · {shortDate(payment.paidAt)}
                          {payment.receiptNo ? ` · ${payment.receiptNo}` : ""}
                        </small>
                      </div>
                      <div className="student-focus-money">
                        <span className="badge green">Masuk</span>
                        <strong>{currency(payment.amount)}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
        {item.invoices.length ? (
          <section className="student-detail-panel">
            <div className="student-detail-panel-head">
              <span>Daftar Tagihan</span>
              <strong>{`${item.invoices.length} tagihan`}</strong>
            </div>
            <div className="table-wrap">
              <table className="compact-table">
                <thead>
                  <tr>
                    <th className="table-number">No</th>
                    <th>Tagihan</th>
                    <th>Tempo</th>
                    <th>Nominal</th>
                    <th>Terbayar</th>
                    <th>Sisa</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {item.invoices.map((invoice, index) => (
                    <tr key={invoice.id}>
                      <td className="table-number">{index + 1}</td>
                      <td>
                        <strong>{invoice.title}</strong>
                        <div className="subtle">
                          {invoice.paymentCategory?.name ??
                            paymentTypeLabel(invoice.type)}
                        </div>
                      </td>
                      <td>{shortDate(invoice.dueDate)}</td>
                      <td className="money">{currency(invoice.amount)}</td>
                      <td className="money green">
                        {currency(paidTotal(invoice))}
                      </td>
                      <td className="money amber">
                        {currency(remainingTotal(invoice))}
                      </td>
                      <td>
                        <span
                          className={`badge ${invoice.status === "LUNAS" ? "green" : "amber"}`}
                        >
                          {statusLabel(invoice.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="student-detail-panel student-detail-empty">
            <div className="student-detail-panel-head">
              <span>Daftar Tagihan</span>
              <strong>Belum ada tagihan</strong>
            </div>
            <div className="empty-state">
              Belum ada tagihan yang dibuat untuk siswa ini.
            </div>
          </section>
        )}
      </div>
    );
  };

  return (
    <main className="page student-center-page">
      <MasterDataToolbar>
        <div className="student-master-toolbar">
          <div className="student-toolbar-card">
            <div className="student-toolbar-row">
              <div className="student-database-tabs">
                <Link
                  className={rosterView === "active" ? "active" : ""}
                  href={`/master/siswa?${new URLSearchParams({ view: "active", classId: selectedClassId }).toString()}`}
                  scroll={false}
                >
                  Siswa Aktif
                </Link>
                <Link
                  className={rosterView === "alumni" ? "active" : ""}
                  href="/master/siswa?view=alumni"
                  scroll={false}
                >
                  Siswa Lulus
                </Link>
                <Link
                  className={rosterView === "all" ? "active" : ""}
                  href={`/master/siswa?${new URLSearchParams({ view: "all", classId: selectedClassId }).toString()}`}
                  scroll={false}
                >
                  Semua Siswa
                </Link>
              </div>
              <div className="table-toolbar-controls">
                <TableSearch
                  placeholder={
                    rosterView === "alumni"
                      ? "Cari nama siswa, NISN, wali, tahun lulus, atau kelas terakhir"
                      : "Cari nama siswa, NISN, kelas, wali, atau status tagihan"
                  }
                  preserve={
                    rosterView === "alumni"
                      ? {
                          classId: selectedClassId,
                          view: rosterView,
                          graduationYear: graduationYearFilter,
                          finalClass: finalClassFilter,
                        }
                      : { classId: selectedClassId, view: rosterView }
                  }
                  query={query}
                />
                <TablePageSizeSelect
                  pageSize={paginatedStudents.pageSize}
                  pathname="/master/siswa"
                  preserve={
                    rosterView === "alumni"
                      ? {
                          ...classPreserve,
                          finalClass: finalClassFilter,
                          graduationYear: graduationYearFilter,
                        }
                      : classPreserve
                  }
                />
              </div>
              <Modal
                size="lg"
                title="Tambah Siswa"
                trigger={
                  <button
                    className="btn btn-create student-toolbar-add"
                    type="button"
                  >
                    <Plus size={17} /> Tambah Siswa
                  </button>
                }
              >
                {form()}
              </Modal>
            </div>
            {rosterView === "alumni" ? (
              <div className="student-filter-row">
                <form className="student-filter-form" method="get">
                  <input name="view" type="hidden" value="alumni" />
                  {query ? (
                    <input name="q" type="hidden" value={query} />
                  ) : null}
                  <label>
                    <span>Tahun Lulus</span>
                    <select
                      defaultValue={graduationYearFilter}
                      name="graduationYear"
                    >
                      <option value="">Semua tahun</option>
                      {alumniYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Kelas Terakhir</span>
                    <select defaultValue={finalClassFilter} name="finalClass">
                      <option value="">Semua kelas</option>
                      {alumniClasses.map((className) => (
                        <option key={className} value={className}>
                          {className}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="btn btn-secondary" type="submit">
                    Terapkan
                  </button>
                </form>
                <Link
                  className="btn btn-create"
                  href={`/master/siswa/export?${alumniExportParams.toString()}`}
                >
                  <Download size={17} /> Export Alumni
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </MasterDataToolbar>
      <NoticeFromParams searchParams={searchParams} />

      <section
        className={`student-center-layout ${showClassBrowser ? "" : "single-column"}`}
      >
        {showClassBrowser ? (
          <aside className="class-browser">
            <div className="class-browser-header">
              <span>Filter Kelas</span>
              <strong>{classes.length} kelas aktif</strong>
            </div>
            {Array.from(classGroups.entries()).map(([level, rooms]) => (
              <div className="class-browser-group" key={level}>
                <span>Tingkat {level}</span>
                {rooms.map((room) => {
                  const summary = classSummaries.find(
                    (item) => item.room.id === room.id,
                  );
                  const hrefParams = new URLSearchParams({ classId: room.id });
                  if (query) hrefParams.set("q", query);
                  return (
                    <Link
                      className={`class-card ${selectedClassId === room.id ? "active" : ""}`}
                      href={`/master/siswa?${hrefParams.toString()}&view=${rosterView}`}
                      key={room.id}
                      scroll={false}
                    >
                      <strong>{room.name}</strong>
                      <small>{summary?.students ?? 0} siswa</small>
                    </Link>
                  );
                })}
              </div>
            ))}
          </aside>
        ) : null}

        <section className="student-center-main">
          <div className="class-overview">
            <div>
              <UsersRound size={20} />
              <span>
                {rosterView === "active"
                  ? isActiveGlobalSearch
                    ? "Cakupan Data"
                    : "Kelas Aktif"
                  : "Mode Database"}
              </span>
              <strong>
                {rosterView === "active"
                  ? isActiveGlobalSearch
                    ? "Semua Kelas"
                    : (selectedSummary?.room.name ?? "-")
                  : rosterView === "alumni"
                    ? "Alumni"
                    : "Semua Siswa"}
              </strong>
            </div>
            <div>
              <UsersRound size={20} />
              <span>
                {rosterView === "alumni"
                  ? "Siswa Lulus"
                  : isActiveGlobalSearch
                    ? "Hasil Pencarian"
                    : "Siswa"}
              </span>
              <strong>
                {rosterView === "alumni"
                  ? alumniStudents.length
                  : rosterView === "all"
                    ? students.length
                    : isActiveGlobalSearch
                      ? filteredStudents.length
                      : (selectedSummary?.students ?? 0)}
              </strong>
            </div>
            <div>
              <ReceiptText size={20} />
              <span>Total Tagihan</span>
              <strong>
                {currency(
                  rosterView === "active" && !isActiveGlobalSearch
                    ? (selectedSummary?.billed ?? 0)
                    : filteredStudents.reduce(
                        (sum, student) =>
                          sum +
                          student.invoices.reduce(
                            (invoiceSum, invoice) =>
                              invoiceSum + invoice.amount,
                            0,
                          ),
                        0,
                      ),
                )}
              </strong>
            </div>
            <div>
              <WalletCards size={20} />
              <span>
                {rosterView === "alumni"
                  ? "Lulus Tahun Terakhir"
                  : "Sisa Tagihan"}
              </span>
              <strong>
                {rosterView === "alumni"
                  ? alumniLatestYear
                  : currency(
                      rosterView === "active" && !isActiveGlobalSearch
                        ? (selectedSummary?.remaining ?? 0)
                        : filteredStudents.reduce(
                            (sum, student) =>
                              sum +
                              student.invoices.reduce(
                                (invoiceSum, invoice) =>
                                  invoiceSum +
                                  Math.max(
                                    invoice.amount - paidTotal(invoice),
                                    0,
                                  ),
                                0,
                              ),
                            0,
                          ),
                    )}
              </strong>
            </div>
          </div>
          <section className="panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="table-number">No</th>
                    <SortableTh
                      activeSortDirection={sortDirection}
                      activeSortKey={sortKey}
                      label="Siswa"
                      pathname="/master/siswa"
                      preserve={tablePreserve}
                      sortKey="name"
                    />
                    <SortableTh
                      activeSortDirection={sortDirection}
                      activeSortKey={sortKey}
                      label="Wali / Telepon"
                      pathname="/master/siswa"
                      preserve={tablePreserve}
                      sortKey="guardian"
                    />
                    {rosterView === "alumni" ? (
                      <SortableTh
                        activeSortDirection={sortDirection}
                        activeSortKey={sortKey}
                        label="Tahun Lulus"
                        pathname="/master/siswa"
                        preserve={tablePreserve}
                        sortKey="graduation"
                      />
                    ) : null}
                    <SortableTh
                      activeSortDirection={sortDirection}
                      activeSortKey={sortKey}
                      className="money"
                      label="Total Tagihan"
                      pathname="/master/siswa"
                      preserve={tablePreserve}
                      sortKey="billed"
                    />
                    <SortableTh
                      activeSortDirection={sortDirection}
                      activeSortKey={sortKey}
                      className="money"
                      label="Sisa"
                      pathname="/master/siswa"
                      preserve={tablePreserve}
                      sortKey="remaining"
                    />
                    <SortableTh
                      activeSortDirection={sortDirection}
                      activeSortKey={sortKey}
                      label="Status Tagihan"
                      pathname="/master/siswa"
                      preserve={tablePreserve}
                      sortKey="status"
                    />
                    <th className="table-actions">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStudents.items.length ? (
                    paginatedStudents.items.map((item, index) => {
                      const billed = item.invoices.reduce(
                        (sum, invoice) => sum + invoice.amount,
                        0,
                      );
                      const paid = item.invoices.reduce(
                        (sum, invoice) => sum + paidTotal(invoice),
                        0,
                      );
                      const billingStatus = billingStatusByStudentId.get(
                        item.id,
                      )!;
                      return (
                        <tr key={item.id}>
                          <td className="table-number">
                            {paginatedStudents.startItem + index}
                          </td>
                          <td>
                            <strong>{item.name}</strong>
                            <div className="subtle">
                              NISN {item.nisn} -{" "}
                              {item.gender === "L"
                                ? "Laki-laki"
                                : item.gender === "P"
                                  ? "Perempuan"
                                  : "Gender belum diisi"}
                              {rosterView !== "alumni"
                                ? ` · ${item.classRoom?.name ?? item.classNameSnapshot ?? "-"}`
                                : ""}
                            </div>
                          </td>
                          <td>
                            {item.guardianName}
                            <div className="subtle">
                              {rosterView === "alumni"
                                ? `Kelas terakhir ${latestClassSnapshot(item)}${item.phone ? ` · ${item.phone}` : ""}`
                                : item.phone || "-"}
                            </div>
                          </td>
                          {rosterView === "alumni" ? (
                            <td>{latestGraduationYear(item)}</td>
                          ) : null}
                          <td className="money">{currency(billed)}</td>
                          <td className="money amber">
                            {currency(Math.max(billed - paid, 0))}
                          </td>
                          <td>
                            <span className={`badge ${billingStatus.tone}`}>
                              {billingStatus.label}
                            </span>
                            <div className="subtle">{billingStatus.note}</div>
                          </td>
                          <td className="table-actions">
                            <div className="table-action-buttons">
                              <Modal
                                size="xl"
                                title={`Detail ${item.name} - ${item.nisn}`}
                                description="Kondisi tagihan dan pembayaran terbaru siswa."
                                trigger={
                                  <button
                                    aria-label="Detail siswa"
                                    className="btn-icon btn-secondary"
                                    title="Detail siswa"
                                    type="button"
                                  >
                                    <Eye size={15} />
                                  </button>
                                }
                              >
                                {detail(item)}
                              </Modal>
                              <Modal
                                size="lg"
                                title="Ubah Siswa"
                                trigger={
                                  <button
                                    aria-label="Ubah siswa"
                                    className="btn-icon btn-edit"
                                    title="Ubah siswa"
                                    type="button"
                                  >
                                    <Pencil size={15} />
                                  </button>
                                }
                              >
                                {form(item)}
                              </Modal>
                              <ConfirmDelete
                                action={deleteStudent}
                                hiddenFields={{ returnTo: studentReturnTo }}
                                id={item.id}
                                label="siswa"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        className="empty"
                        colSpan={rosterView === "alumni" ? 8 : 7}
                      >
                        {rosterView === "alumni"
                          ? "Data siswa lulus belum tersedia."
                          : isActiveGlobalSearch
                            ? "Data siswa yang dicari tidak ditemukan."
                            : "Data siswa pada kelas ini tidak ditemukan."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={paginatedStudents.currentPage}
              endItem={paginatedStudents.endItem}
              pageSize={paginatedStudents.pageSize}
              pathname="/master/siswa"
              preserve={classPreserve}
              startItem={paginatedStudents.startItem}
              totalItems={paginatedStudents.totalItems}
              totalPages={paginatedStudents.totalPages}
            />
          </section>
        </section>
      </section>
    </main>
  );
}
