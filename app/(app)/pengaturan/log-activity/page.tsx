import { redirect } from "next/navigation";
import { NoticeFromParams, type PageSearchParams } from "@/components/notice-from-params";
import { TablePagination, TablePageSizeSelect } from "@/components/table-pagination";
import { TableSearch } from "@/components/table-search";
import { requireUser } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { paginateItems, readPageParam, readPageSizeParam } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { matchesSearch, readSearchParam } from "@/lib/search";

function jsonPreview(value: unknown) {
  if (!value) return "-";
  return JSON.stringify(value, null, 2);
}

export default async function ActivityLogPage({ searchParams }: { searchParams: PageSearchParams }) {
  const user = await requireUser();
  if (!["SUPERADMIN", "ADMIN"].includes(user.role)) {
    redirect("/dashboard?notice=Akses log activity hanya untuk administrator.&noticeType=error");
  }

  const params = await searchParams;
  const query = readSearchParam(params, "q");
  const page = readPageParam(params, "page");
  const pageSize = readPageSizeParam(params, "pageSize");
  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  const filteredLogs = logs.filter((log) =>
    matchesSearch(
      query,
      log.action,
      log.entity,
      log.entityId,
      log.userName,
      log.userEmail,
      log.userRole,
    ),
  );
  const paginatedLogs = paginateItems(filteredLogs, page, pageSize);

  return (
    <main className="page">
      <section className="page-title">
        <div className="page-title-copy">
          <h2>Log Activity</h2>
          <p>Audit aktivitas aplikasi: login, logout, tambah, ubah, hapus data, lengkap dengan before/after dan user pelaku.</p>
          <div className="table-toolbar-controls">
            <TablePageSizeSelect pageSize={paginatedLogs.pageSize} pathname="/pengaturan/log-activity" preserve={{ q: query }} />
            <TableSearch placeholder="Cari user, aksi, modul, atau ID data" query={query} />
          </div>
        </div>
      </section>
      <NoticeFromParams searchParams={searchParams} />
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="table-number">No</th>
                <th>Waktu</th>
                <th>User</th>
                <th>Aktivitas</th>
                <th>Data Before</th>
                <th>Data After</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.items.length ? (
                paginatedLogs.items.map((log, index) => (
                  <tr key={log.id}>
                    <td className="table-number">{paginatedLogs.startItem + index}</td>
                    <td>
                      <strong>{shortDate(log.createdAt)}</strong>
                      <div className="subtle">{log.createdAt.toLocaleTimeString("id-ID")}</div>
                    </td>
                    <td>
                      <strong>{log.userName ?? "-"}</strong>
                      <div className="subtle">{log.userEmail ?? "-"} · {log.userRole ?? "-"}</div>
                    </td>
                    <td>
                      <strong>{log.action}</strong>
                      <div className="subtle">{log.entity}{log.entityId ? ` · ${log.entityId}` : ""}</div>
                    </td>
                    <td><pre className="activity-json">{jsonPreview(log.before)}</pre></td>
                    <td><pre className="activity-json">{jsonPreview(log.after)}</pre></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty" colSpan={6}>Log aktivitas tidak ditemukan.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={paginatedLogs.currentPage} endItem={paginatedLogs.endItem} pageSize={paginatedLogs.pageSize} pathname="/pengaturan/log-activity" preserve={{ q: query }} startItem={paginatedLogs.startItem} totalItems={paginatedLogs.totalItems} totalPages={paginatedLogs.totalPages} />
      </section>
    </main>
  );
}
