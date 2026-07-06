"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type SelectOption = {
  label: string;
  value: string;
};

export function TableSelectFilter({
  allLabel,
  options,
  preserve = {},
  value,
  valueKey = "filter",
}: {
  allLabel: string;
  options: SelectOption[];
  preserve?: Record<string, string>;
  value: string;
  valueKey?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateValue(nextValue: string) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, currentValue] of Object.entries(preserve)) {
      if (key !== valueKey) {
        if (currentValue) params.set(key, currentValue);
        else params.delete(key);
      }
    }

    if (nextValue) params.set(valueKey, nextValue);
    else params.delete(valueKey);

    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  return (
    <label className="table-select-filter">
      <select
        aria-label={allLabel}
        className="table-select-filter-input"
        onChange={(event) => updateValue(event.target.value)}
        value={value}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
