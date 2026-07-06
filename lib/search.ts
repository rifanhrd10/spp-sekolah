export function readSearchParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

export function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("id-ID");
}

export function matchesSearch(query: string, ...values: Array<string | number | null | undefined>) {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;

  return values.some((value) => String(value ?? "").toLocaleLowerCase("id-ID").includes(normalized));
}
