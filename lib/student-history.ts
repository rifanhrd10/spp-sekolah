type StudentHistoryLike = {
  movementType: string;
  academicYear: string;
  fromClassNameSnapshot: string | null;
  toAcademicYear: string | null;
};

type StudentLike = {
  classHistory: StudentHistoryLike[];
  classNameSnapshot: string | null;
};

export function graduationHistory(student: StudentLike) {
  return [...student.classHistory].reverse().find((item) => item.movementType === "LULUS") ?? null;
}

export function latestGraduationYear(student: StudentLike) {
  const graduation = graduationHistory(student);
  return graduation?.toAcademicYear ?? graduation?.academicYear ?? "-";
}

export function latestClassSnapshot(student: StudentLike) {
  const graduation = graduationHistory(student);
  return graduation?.fromClassNameSnapshot ?? student.classNameSnapshot ?? "-";
}
