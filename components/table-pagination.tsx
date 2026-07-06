"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ALL_VALUE, PAGE_SIZE_OPTIONS, type PageSizeValue } from "@/lib/pagination";

function buildQuery(
  preserve: Record<string, string>,
  pageKey: string,
  pageSizeKey: string,
  page: number,
  pageSize: PageSizeValue,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(preserve)) {
    if (value) params.set(key, value);
  }

  if (page > 1 && pageSize !== ALL_VALUE) params.set(pageKey, String(page));
  else params.delete(pageKey);

  if (pageSize !== 10) params.set(pageSizeKey, String(pageSize));
  else params.delete(pageSizeKey);

  return params.toString();
}

function buildHref(
  pathname: string,
  preserve: Record<string, string>,
  pageKey: string,
  pageSizeKey: string,
  page: number,
  pageSize: PageSizeValue,
) {
  const query = buildQuery(preserve, pageKey, pageSizeKey, page, pageSize);
  return query ? `${pathname}?${query}` : pathname;
}

function visiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  return Array.from(pages).filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
}

export function TablePagination({
  pathname,
  preserve = {},
  pageKey = "page",
  pageSizeKey = "pageSize",
  currentPage,
  pageSize,
  totalItems,
  totalPages,
  startItem,
  endItem,
}: {
  pathname: string;
  preserve?: Record<string, string>;
  pageKey?: string;
  pageSizeKey?: string;
  currentPage: number;
  pageSize: PageSizeValue;
  totalItems: number;
  totalPages: number;
  startItem: number;
  endItem: number;
}) {
  const pages = visiblePages(currentPage, totalPages);
  const currentPathname = usePathname();
  const resolvedPathname = currentPathname || pathname;

  return (
    <div className="table-pagination">
      <div className="table-pagination-meta">
        <span>
          {totalItems ? `${startItem}-${endItem} dari ${totalItems}` : "0 data"}
        </span>
      </div>
      <div className="table-pagination-nav">
        <Link
          aria-disabled={currentPage <= 1}
          className={`pagination-chip icon ${currentPage <= 1 ? "disabled" : ""}`}
          href={buildHref(resolvedPathname, preserve, pageKey, pageSizeKey, currentPage - 1, pageSize)}
          scroll={false}
        >
          <ChevronLeft size={15} />
        </Link>
        {pages.map((page, index) => (
          <span className="pagination-group" key={page}>
            {index > 0 && pages[index - 1] !== page - 1 ? <span className="pagination-ellipsis">...</span> : null}
            <Link
              className={`pagination-chip ${currentPage === page ? "active" : ""}`}
              href={buildHref(resolvedPathname, preserve, pageKey, pageSizeKey, page, pageSize)}
              scroll={false}
            >
              {page}
            </Link>
          </span>
        ))}
        <Link
          aria-disabled={currentPage >= totalPages}
          className={`pagination-chip icon ${currentPage >= totalPages ? "disabled" : ""}`}
          href={buildHref(resolvedPathname, preserve, pageKey, pageSizeKey, currentPage + 1, pageSize)}
          scroll={false}
        >
          <ChevronRight size={15} />
        </Link>
      </div>
    </div>
  );
}

export function TablePageSizeSelect({
  pathname,
  preserve = {},
  pageKey = "page",
  pageSizeKey = "pageSize",
  pageSize,
}: {
  pathname: string;
  preserve?: Record<string, string>;
  pageKey?: string;
  pageSizeKey?: string;
  pageSize: PageSizeValue;
}) {
  const currentPathname = usePathname();
  const router = useRouter();
  const resolvedPathname = currentPathname || pathname;

  function updatePageSize(nextPageSize: string) {
    const parsedPageSize = nextPageSize === ALL_VALUE ? ALL_VALUE : (Number.parseInt(nextPageSize, 10) as Exclude<PageSizeValue, "ALL">);
    const query = buildQuery(preserve, pageKey, pageSizeKey, 1, parsedPageSize);
    router.replace(query ? `${resolvedPathname}?${query}` : resolvedPathname, { scroll: false });
  }

  return (
    <label className="pagination-select-label">
      <select
        aria-label="Jumlah data per halaman"
        className="pagination-select"
        onChange={(event) => updatePageSize(event.target.value)}
        value={String(pageSize)}
      >
        {PAGE_SIZE_OPTIONS.map((option) => (
          <option key={option} value={String(option)}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
