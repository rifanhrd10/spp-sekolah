import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortDirection } from "@/lib/sort";

function buildHref(
  pathname: string,
  preserve: Record<string, string>,
  sortKeyParam: string,
  sortDirParam: string,
  sortKey: string,
  activeSortKey: string,
  activeSortDirection: SortDirection,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(preserve)) {
    if (value) params.set(key, value);
  }

  const nextDirection: SortDirection =
    activeSortKey === sortKey && activeSortDirection === "asc" ? "desc" : "asc";

  params.set(sortKeyParam, sortKey);
  params.set(sortDirParam, nextDirection);

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function SortableTh({
  pathname,
  label,
  sortKey,
  activeSortKey,
  activeSortDirection,
  preserve = {},
  sortKeyParam = "sort",
  sortDirParam = "dir",
  className = "",
}: {
  pathname: string;
  label: string;
  sortKey: string;
  activeSortKey: string;
  activeSortDirection: SortDirection;
  preserve?: Record<string, string>;
  sortKeyParam?: string;
  sortDirParam?: string;
  className?: string;
}) {
  const active = activeSortKey === sortKey;
  const Icon = active ? (activeSortDirection === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;

  return (
    <th className={className}>
      <Link
        className={`sort-link ${active ? "active" : ""}`}
        href={buildHref(pathname, preserve, sortKeyParam, sortDirParam, sortKey, activeSortKey, activeSortDirection)}
        scroll={false}
      >
        <span>{label}</span>
        <Icon size={13} strokeWidth={2.1} />
      </Link>
    </th>
  );
}
