export function readDateParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  const normalized = typeof value === "string" ? value : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

export function isWithinDateRange(date: Date, from: string, to: string) {
  const timestamp = date.getTime();
  const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  return timestamp >= fromTime && timestamp <= toTime;
}
