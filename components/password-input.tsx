"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function PasswordInput({ defaultValue }: { defaultValue?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <input
        autoComplete="current-password"
        defaultValue={defaultValue}
        name="password"
        placeholder="Masukkan password"
        required
        type={visible ? "text" : "password"}
      />
      <button
        aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
        className="password-toggle"
        onClick={() => setVisible((value) => !value)}
        title={visible ? "Sembunyikan password" : "Tampilkan password"}
        type="button"
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
