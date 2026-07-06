"use client";

import { ArrowRight, Search, SlidersHorizontal, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { currency } from "@/lib/format";

type PromotionClass = {
  id: string;
  name: string;
  level: string;
  active: boolean;
};

type PromotionStudent = {
  id: string;
  nisn: string;
  name: string;
  classRoomId: string | null;
  className: string;
  gender: string | null;
  promotionStatus: string;
  active: boolean;
  remaining: number;
};

type Action = (formData: FormData) => void | Promise<void>;

function statusText(value: string) {
  const labels: Record<string, string> = {
    BELUM_DITENTUKAN: "Belum Ditentukan",
    NAIK: "Naik",
    TINGGAL: "Tinggal",
    PINDAH: "Pindah",
    LULUS: "Lulus",
  };

  return labels[value] ?? value;
}

export function ClassPromotionWorkflow({
  action,
  classes,
  students,
  showCancelButton = false,
}: {
  action: Action;
  classes: PromotionClass[];
  students: PromotionStudent[];
  showCancelButton?: boolean;
}) {
  const activeClasses = classes.filter((room) => room.active);
  const firstClassId = activeClasses.find((room) =>
    students.some((student) => student.active && student.classRoomId === room.id),
  )?.id ?? "";
  const [sourceClassRoomId, setSourceClassRoomId] = useState(firstClassId);
  const [targetClassRoomId, setTargetClassRoomId] = useState("");
  const [movementType, setMovementType] = useState<"PROMOSI" | "LULUS">("PROMOSI");
  const [decisionStatus, setDecisionStatus] = useState<"NAIK" | "PINDAH" | "TINGGAL">("NAIK");
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState("ALL");
  const [debtStatus, setDebtStatus] = useState("ALL");
  const [promotionStatus, setPromotionStatus] = useState("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sourceClass = classes.find((room) => room.id === sourceClassRoomId);
  const targetClass = classes.find((room) => room.id === targetClassRoomId);
  const classStudents = useMemo(() => (
    students.filter((student) => student.active && student.classRoomId === sourceClassRoomId)
  ), [sourceClassRoomId, students]);
  const visibleStudents = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("id-ID");
    return classStudents.filter((student) => {
      const matchKeyword = !keyword || [student.name, student.nisn, student.className]
        .some((value) => value.toLocaleLowerCase("id-ID").includes(keyword));
      const matchGender = gender === "ALL" || student.gender === gender;
      const matchDebt = debtStatus === "ALL"
        || (debtStatus === "CLEAR" ? student.remaining <= 0 : student.remaining > 0);
      const matchPromotion = promotionStatus === "ALL" || student.promotionStatus === promotionStatus;

      return matchKeyword && matchGender && matchDebt && matchPromotion;
    });
  }, [classStudents, debtStatus, gender, promotionStatus, query]);
  const selectedStudents = classStudents.filter((student) => selectedIds.has(student.id));
  const allVisibleSelected = visibleStudents.length > 0 && visibleStudents.every((student) => selectedIds.has(student.id));
  const canSubmit = selectedStudents.length > 0 && (movementType === "LULUS" || Boolean(targetClassRoomId));

  function resetForSource(nextClassId: string) {
    setSourceClassRoomId(nextClassId);
    setSelectedIds(new Set());
  }

  function toggleStudent(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setVisible(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleStudents.forEach((student) => {
        if (checked) next.add(student.id);
        else next.delete(student.id);
      });
      return next;
    });
  }

  function setWholeClass() {
    setSelectedIds(new Set(classStudents.map((student) => student.id)));
  }

  return (
    <form action={action} className="promotion-workflow">
      <input name="sourceClassRoomId" type="hidden" value={sourceClassRoomId} />
      <input name="targetClassRoomId" type="hidden" value={movementType === "LULUS" ? "" : targetClassRoomId} />
      <input name="movementType" type="hidden" value={movementType} />
      <input name="decisionStatus" type="hidden" value={movementType === "LULUS" ? "LULUS" : decisionStatus} />
      {Array.from(selectedIds).map((id) => <input key={id} name="studentIds" type="hidden" value={id} />)}

      <section className="promotion-step-card">
        <div className="promotion-step-heading">
          <span>1</span>
          <div><strong>Tentukan perpindahan</strong><small>Pilih tahun ajaran dan kelas asal lalu tentukan tujuan siswa.</small></div>
        </div>
        <div className="promotion-flow-grid">
          <label>
            Tahun Ajaran Asal
            <input defaultValue="2025/2026" name="fromAcademicYear" required />
          </label>
          <label>
            Kelas Asal
            <select onChange={(event) => resetForSource(event.target.value)} required value={sourceClassRoomId}>
              <option value="">Pilih kelas asal</option>
              {activeClasses.map((room) => (
                <option key={room.id} value={room.id}>{room.name}</option>
              ))}
            </select>
          </label>
          <div className="promotion-direction"><ArrowRight size={18} /></div>
          <label>
            Tahun Ajaran Tujuan
            <input defaultValue="2026/2027" name="toAcademicYear" required />
          </label>
          <label>
            Kelas Tujuan
            <select
              disabled={movementType === "LULUS"}
              onChange={(event) => setTargetClassRoomId(event.target.value)}
              required={movementType === "PROMOSI"}
              value={targetClassRoomId}
            >
              <option value="">Pilih kelas tujuan</option>
              {activeClasses.filter((room) => room.id !== sourceClassRoomId).map((room) => (
                <option key={room.id} value={room.id}>{room.name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="promotion-step-card">
        <div className="promotion-step-heading">
          <span>2</span>
          <div><strong>Pilih siswa</strong><small><SlidersHorizontal size={13} /> Gunakan filter bila hanya sebagian siswa yang diproses.</small></div>
        </div>
      <div className="promotion-toolbar">
        <label>
          Proses
          <select onChange={(event) => setMovementType(event.target.value as "PROMOSI" | "LULUS")} value={movementType}>
            <option value="PROMOSI">Naik / pindah kelas</option>
            <option value="LULUS">Luluskan siswa</option>
          </select>
        </label>
        <label>
          Keputusan
          <select
            disabled={movementType === "LULUS"}
            onChange={(event) => setDecisionStatus(event.target.value as "NAIK" | "PINDAH" | "TINGGAL")}
            value={movementType === "LULUS" ? "LULUS" : decisionStatus}
          >
            {movementType === "LULUS" ? <option value="LULUS">Lulus</option> : null}
            <option value="NAIK">Naik</option>
            <option value="PINDAH">Pindah</option>
            <option value="TINGGAL">Tinggal</option>
          </select>
        </label>
        <label>
          Jenis Kelamin
          <select onChange={(event) => setGender(event.target.value)} value={gender}>
            <option value="ALL">Semua</option>
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </select>
        </label>
        <label>
          Status Tagihan
          <select onChange={(event) => setDebtStatus(event.target.value)} value={debtStatus}>
            <option value="ALL">Semua</option>
            <option value="CLEAR">Tidak ada tunggakan</option>
            <option value="HAS_DEBT">Ada tunggakan</option>
          </select>
        </label>
        <label>
          Status Siswa
          <select onChange={(event) => setPromotionStatus(event.target.value)} value={promotionStatus}>
            <option value="ALL">Semua</option>
            <option value="BELUM_DITENTUKAN">Belum Ditentukan</option>
            <option value="NAIK">Naik</option>
            <option value="TINGGAL">Tinggal</option>
            <option value="PINDAH">Pindah</option>
            <option value="LULUS">Lulus</option>
          </select>
        </label>
      </div>

      <div className="promotion-search-row">
        <label className="promotion-search">
          <span>Cari Siswa</span>
          <div className="input-with-icon">
            <Search size={17} />
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau NISN" value={query} />
          </div>
        </label>
        <button className="btn btn-secondary" onClick={setWholeClass} type="button">
          <UsersRound size={16} /> Pilih Semua Siswa di Kelas Ini
        </button>
      </div>

      <div className="promotion-table-wrap">
        <table className="promotion-table">
          <thead>
            <tr>
              <th className="checkbox-cell">
                <input checked={allVisibleSelected} onChange={(event) => setVisible(event.target.checked)} type="checkbox" />
              </th>
              <th className="table-number">No</th>
              <th>Siswa</th>
              <th>Gender</th>
              <th>Status</th>
              <th>Sisa Tagihan</th>
            </tr>
          </thead>
          <tbody>
            {visibleStudents.length ? visibleStudents.map((student, index) => (
              <tr className={selectedIds.has(student.id) ? "selected" : ""} key={student.id}>
                <td className="checkbox-cell">
                  <input checked={selectedIds.has(student.id)} onChange={() => toggleStudent(student.id)} type="checkbox" />
                </td>
                <td className="table-number">{index + 1}</td>
                <td><strong>{student.name}</strong><div className="subtle">NISN {student.nisn}</div></td>
                <td>{student.gender === "L" ? "Laki-laki" : student.gender === "P" ? "Perempuan" : "-"}</td>
                <td><span className="badge cyan">{statusText(student.promotionStatus)}</span></td>
                <td className={`money ${student.remaining > 0 ? "amber" : "green"}`}>{currency(student.remaining)}</td>
              </tr>
            )) : (
              <tr><td className="empty" colSpan={6}>Tidak ada siswa sesuai filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      </section>

      <div className="promotion-preview">
        <div>
          <span>Preview Proses</span>
          <strong>
            {selectedStudents.length} siswa akan {movementType === "LULUS" ? "diluluskan" : "dipindahkan"}
            {sourceClass ? ` dari ${sourceClass.name}` : ""}
            {movementType !== "LULUS" && targetClass ? ` ke ${targetClass.name}` : ""}.
          </strong>
        </div>
        <small>{classStudents.length - selectedStudents.length} siswa tidak ikut proses dan tetap di kelas asal.</small>
      </div>

      <div className="promotion-submit-row">
        <label>
          Catatan Proses
          <input name="note" placeholder="Contoh: kenaikan kelas reguler tahun ajaran baru" />
        </label>
        <div className="form-actions">
          {showCancelButton ? <button className="btn btn-cancel" type="reset">Reset Form</button> : null}
          <button className="btn btn-save" disabled={!canSubmit} type="submit">
            Proses Siswa Terpilih
          </button>
        </div>
      </div>
    </form>
  );
}
