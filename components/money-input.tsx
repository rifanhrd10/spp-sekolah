"use client";

import { useState } from "react";

function digits(value: string | number | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function formatted(value: string) {
  return value ? new Intl.NumberFormat("id-ID").format(Number(value)) : "";
}

export function MoneyInput({
  defaultValue,
  name = "amount",
  onValueChange,
  placeholder = "0",
}: {
  defaultValue?: string | number;
  name?: string;
  onValueChange?: (value: number) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState(() => digits(defaultValue));

  return (
    <div className="money-input">
      <span>Rp.</span>
      <input
        inputMode="numeric"
        onChange={(event) => {
          const nextValue = digits(event.target.value);
          setValue(nextValue);
          onValueChange?.(Number(nextValue || 0));
        }}
        placeholder={placeholder}
        required
        type="text"
        value={formatted(value)}
      />
      <input name={name} type="hidden" value={value} />
    </div>
  );
}
