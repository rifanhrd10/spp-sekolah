"use client";

import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type AvailabilityState = "idle" | "checking" | "available" | "taken";

export function NisnInput({
  defaultValue = "",
  excludeId,
}: {
  defaultValue?: string;
  excludeId?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [state, setState] = useState<AvailabilityState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    const nisn = value.trim();
    input?.setCustomValidity("");

    if (!nisn || nisn.length < 4 || !/^\d+$/.test(nisn)) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ nisn });
        if (excludeId) params.set("excludeId", excludeId);
        const response = await fetch(`/api/students/nisn?${params.toString()}`, {
          signal: controller.signal,
        });
        const result = await response.json() as { available: boolean };
        if (result.available) {
          setState("available");
          input?.setCustomValidity("");
        } else {
          setState("taken");
          input?.setCustomValidity("NISN sudah terdaftar.");
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setState("idle");
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [excludeId, value]);

  return (
    <div className={`validated-input ${state}`}>
      <input
        autoComplete="off"
        defaultValue={defaultValue}
        inputMode="numeric"
        maxLength={20}
        minLength={4}
        name="nisn"
        onInput={(event) => {
          const nextValue = event.currentTarget.value.replace(/\D/g, "");
          event.currentTarget.value = nextValue;
          setState(nextValue.length >= 4 ? "checking" : "idle");
          setValue(nextValue);
        }}
        pattern="[0-9]+"
        ref={inputRef}
        required
      />
      <span className="validated-input-status" aria-live="polite">
        {state === "checking" ? <><LoaderCircle className="spin" size={14} /> Memeriksa NISN</> : null}
        {state === "available" ? <><CheckCircle2 size={14} /> NISN tersedia</> : null}
        {state === "taken" ? <><XCircle size={14} /> NISN sudah terdaftar</> : null}
      </span>
    </div>
  );
}
