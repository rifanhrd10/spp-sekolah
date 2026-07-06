import { CalendarDays, RotateCcw } from "lucide-react";
import Link from "next/link";

export function DateRangeFilter({
  from,
  pathname,
  preserve = {},
  to,
}: {
  from: string;
  pathname: string;
  preserve?: Record<string, string>;
  to: string;
}) {
  const resetParams = new URLSearchParams(
    Object.entries(preserve).filter(([, value]) => Boolean(value)),
  );

  return (
    <form className="date-range-filter" method="get">
      {Object.entries(preserve).map(([key, value]) => (
        value ? <input key={key} name={key} type="hidden" value={value} /> : null
      ))}
      <CalendarDays size={17} />
      <label>
        <span>Dari</span>
        <input defaultValue={from} name="from" type="date" />
      </label>
      <span className="date-range-separator">s.d.</span>
      <label>
        <span>Sampai</span>
        <input defaultValue={to} name="to" type="date" />
      </label>
      <button className="btn btn-secondary date-filter-submit" type="submit">Terapkan</button>
      {(from || to) ? (
        <Link
          aria-label="Reset filter tanggal"
          className="btn-icon btn-secondary"
          href={`${pathname}${resetParams.size ? `?${resetParams.toString()}` : ""}`}
          title="Reset filter tanggal"
        >
          <RotateCcw size={15} />
        </Link>
      ) : null}
    </form>
  );
}
