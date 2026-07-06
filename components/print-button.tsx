"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      aria-label="Cetak kwitansi"
      className="btn-icon btn-create no-print"
      onClick={() => window.print()}
      title="Cetak kwitansi"
      type="button"
    >
      <Printer size={17} />
    </button>
  );
}
