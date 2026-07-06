"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export function TableSearch({
  queryKey = "q",
  query,
  placeholder,
  preserve = {},
}: {
  queryKey?: string;
  query: string;
  placeholder: string;
  preserve?: Record<string, string>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(query);
  const [, startTransition] = useTransition();

  function updateSearch(nextValue: string) {
    setValue(nextValue);

    const params = new URLSearchParams(searchParams.toString());

    for (const [key, currentValue] of Object.entries(preserve)) {
      if (key !== queryKey) {
        if (currentValue) params.set(key, currentValue);
        else params.delete(key);
      }
    }

    if (nextValue.trim()) params.set(queryKey, nextValue.trim());
    else params.delete(queryKey);

    startTransition(() => {
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="table-search" role="search">
      <label className="table-search-input">
        <Search size={16} />
        <input
          key={`${pathname}:${queryKey}`}
          onChange={(event) => updateSearch(event.target.value)}
          placeholder={placeholder}
          type="search"
          value={value}
        />
        {value ? (
          <button
            className="table-search-clear"
            onClick={() => updateSearch("")}
            title="Hapus pencarian"
            type="button"
          >
            <X size={14} />
          </button>
        ) : null}
      </label>
    </div>
  );
}
