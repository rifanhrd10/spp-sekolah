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
  placeholder = "0",
}: {
  defaultValue?: string | number;
  name?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(() => digits(defaultValue));

  return (
    <div className="money-input">
      <span>Rp.</span>
      <input
        inputMode="numeric"
        onChange={(event) => setValue(digits(event.target.value))}
        placeholder={placeholder}
        required
        type="text"
        value={formatted(value)}
      />
      <input name={name} type="hidden" value={value} />
    </div>
  );
}
