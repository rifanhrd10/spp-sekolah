import { PermissionKey } from "@prisma/client";
import { ArrowRight, GraduationCap, History, School2, UsersRound, WalletCards } from "lucide-react";
import { promoteClassStudents } from "@/app/actions";
import { ClassPromotionWorkflow } from "@/components/class-promotion-workflow";
import { NoticeFromParams, type PageSearchParams } from "@/components/notice-from-params";
import { requirePermission } from "@/lib/auth";
import { paidTotal } from "@/lib/finance";
import { currency, shortDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const levelOrder: Record<string, number> = {
  VII: 1,
  VIII: 2,
  IX: 3,
};

export default async function PromotionPage({ searchParams }: { searchParams: PageSearchParams }) {
  await requirePermission(PermissionKey.MASTER_CLASS);
  const [classes, promotionStudents, histories] = await Promise.all([
    prisma.classRoom.findMany({
      where: { deletedAt: null },
      include: { students: { where: { deletedAt: null } } },
      orderBy: { name: "asc" },
    }),
    prisma.student.findMany({
      where: { active: true, deletedAt: null },
      include: {
        classRoom: true,
        invoices: {
          where: { deletedAt: null },
          include: { payments: { where: { deletedAt: null }, select: { amount: true } } },
        },
      },
      orderBy: [{ classRoom: { level: "asc" } }, { classRoom: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.studentClassHistory.findMany({
      include: {
        student: true,
      },
      orderBy: [{ movedAt: "desc" }],
      take: 12,
    }),
  ]);

  const sortedClasses = [...classes].sort((left, right) => {
    const byLevel = (levelOrder[left.level] ?? Number.MAX_SAFE_INTEGER) - (levelOrder[right.level] ?? Number.MAX_SAFE_INTEGER);
    if (byLevel !== 0) return byLevel;
    return left.name.localeCompare(right.name, "id");
  });
  const activeClassCount = sortedClasses.filter((room) => room.active).length;
  const totalStudents = promotionStudents.length;
  const studentsWithDebt = promotionStudents.filter((student) => {
    const billed = student.invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    const paid = student.invoices.reduce((sum, invoice) => sum + paidTotal(invoice), 0);
    return billed - paid > 0;
  }).length;

  return (
    <main className="page promotion-page">
      <section className="summary-grid report">
        <div className="metric">
          <div>
            <span className="label">Kelas Aktif</span>
            <strong>{activeClassCount}</strong>
          </div>
          <div className="foot">
            <span>Siap diproses</span>
            <School2 size={20} />
          </div>
        </div>
        <div className="metric cyan">
          <div>
            <span className="label">Siswa Aktif</span>
            <strong>{totalStudents}</strong>
          </div>
          <div className="foot">
            <span>Database berjalan</span>
            <UsersRound size={20} />
          </div>
        </div>
        <div className="metric amber">
          <div>
            <span className="label">Masih Ada Tunggakan</span>
            <strong>{studentsWithDebt}</strong>
          </div>
          <div className="foot">
            <span>Perlu perhatian</span>
            <WalletCards size={20} />
          </div>
        </div>
        <div className="metric">
          <div>
            <span className="label">Riwayat Terakhir</span>
            <strong>{histories.length}</strong>
          </div>
          <div className="foot">
            <span>Mutasi tersimpan</span>
            <History size={20} />
          </div>
        </div>
      </section>

      <NoticeFromParams searchParams={searchParams} />

      <section className="content-grid form-main promotion-page-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span>Proses Akademik</span>
              <h2>Kenaikan Kelas dan Kelulusan</h2>
            </div>
          </div>
          <ClassPromotionWorkflow
            action={promoteClassStudents}
            classes={sortedClasses.map((room) => ({
              active: room.active,
              id: room.id,
              level: room.level,
              name: room.name,
            }))}
            students={promotionStudents.map((student) => {
              const billed = student.invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
              const paid = student.invoices.reduce((sum, invoice) => sum + paidTotal(invoice), 0);
              return {
                active: student.active,
                className: student.classRoom?.name ?? student.classNameSnapshot ?? "-",
                classRoomId: student.classRoomId,
                finalScore: student.finalScore,
                gender: student.gender,
                id: student.id,
                name: student.name,
                nisn: student.nisn,
                promotionStatus: student.promotionStatus,
                remaining: Math.max(billed - paid, 0),
              };
            })}
          />
        </section>

        <section className="panel promotion-history-panel">
          <div className="panel-heading">
            <div>
              <span>Riwayat</span>
              <h2>Pergerakan Siswa Terakhir</h2>
            </div>
          </div>
          <div className="promotion-history-list">
            {histories.length ? histories.map((history) => (
              <article className="promotion-history-item" key={history.id}>
                <div className="promotion-history-icon"><GraduationCap size={18} /></div>
                <div className="promotion-history-content">
                  <div className="promotion-history-title"><strong>{history.student.name}</strong><span className={`badge ${history.movementType === "LULUS" ? "green" : "cyan"}`}>{history.movementType === "LULUS" ? "Lulus" : history.decisionStatus ?? "Mutasi"}</span></div>
                  <div className="promotion-history-route">
                    <span>{history.fromClassNameSnapshot ?? "-"}<small>{history.fromAcademicYear ?? "-"}</small></span>
                    <ArrowRight size={15} />
                    <span>{history.toClassNameSnapshot ?? "-"}<small>{history.toAcademicYear ?? history.academicYear}</small></span>
                  </div>
                  <small>
                    Diproses {shortDate(history.movedAt)} oleh {history.movedBy}
                  </small>
                </div>
              </article>
            )) : (
              <div className="empty-state">Belum ada riwayat kenaikan kelas yang tersimpan.</div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
