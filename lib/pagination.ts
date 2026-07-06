const ALL_VALUE = "ALL";
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, ALL_VALUE] as const;

export type PageSizeValue = (typeof PAGE_SIZE_OPTIONS)[number];

export function readPageParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const raw = params[key];
  const value = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  const page = Number.parseInt(value || "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function readPageSizeParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const raw = params[key];
  const value = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  if (value === ALL_VALUE) return ALL_VALUE;

  const pageSize = Number.parseInt(value || "10", 10);
  return PAGE_SIZE_OPTIONS.includes(pageSize as PageSizeValue) ? (pageSize as Exclude<PageSizeValue, "ALL">) : 10;
}

export function paginateItems<T>(items: T[], page: number, pageSize: PageSizeValue) {
  const totalItems = items.length;

  if (pageSize === ALL_VALUE) {
    return {
      items,
      currentPage: 1,
      pageSize,
      totalItems,
      totalPages: 1,
      startItem: totalItems ? 1 : 0,
      endItem: totalItems,
    };
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  return {
    items: items.slice(startIndex, endIndex),
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startItem: totalItems ? startIndex + 1 : 0,
    endItem: Math.min(endIndex, totalItems),
  };
}

export { ALL_VALUE, PAGE_SIZE_OPTIONS };
