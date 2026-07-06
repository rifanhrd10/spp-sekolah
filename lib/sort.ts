export type SortDirection = "asc" | "desc";

export function readSortKeyParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
  fallback: string,
) {
  const value = params[key];
  if (typeof value === "string" && value) return value;
  if (Array.isArray(value) && value[0]) return value[0];
  return fallback;
}

export function readSortDirectionParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
  fallback: SortDirection = "asc",
) {
  const value = params[key];
  const current = typeof value === "string" ? value : Array.isArray(value) ? value[0] : "";
  return current === "desc" ? "desc" : fallback;
}

export function compareValues(
  left: string | number | boolean | Date | null | undefined,
  right: string | number | boolean | Date | null | undefined,
  direction: SortDirection,
) {
  const a = left instanceof Date ? left.getTime() : left;
  const b = right instanceof Date ? right.getTime() : right;

  if (a == null && b == null) return 0;
  if (a == null) return direction === "asc" ? 1 : -1;
  if (b == null) return direction === "asc" ? -1 : 1;

  let result = 0;

  if (typeof a === "string" || typeof b === "string") {
    result = String(a).localeCompare(String(b), "id-ID", { numeric: true, sensitivity: "base" });
  } else if (typeof a === "boolean" || typeof b === "boolean") {
    result = Number(Boolean(a)) - Number(Boolean(b));
  } else {
    result = Number(a) - Number(b);
  }

  return direction === "asc" ? result : -result;
}
