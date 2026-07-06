"use client";

import { Trash2, X } from "lucide-react";
import { useId, useRef } from "react";

export function Modal({
  trigger,
  title,
  description,
  children,
  size = "md",
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <span onClick={() => dialogRef.current?.showModal()}>{trigger}</span>
      <dialog
        aria-labelledby={titleId}
        className={`app-modal app-modal-${size}`}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current.close();
        }}
        ref={dialogRef}
      >
        <div className="modal-head">
          <div>
            <h3 id={titleId}>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
          <button className="icon-btn" onClick={() => dialogRef.current?.close()} title="Tutup" type="button">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </dialog>
    </>
  );
}

export function ModalCancelButton() {
  return (
    <button
      className="btn btn-cancel"
      onClick={(event) => event.currentTarget.closest("dialog")?.close()}
      type="button"
    >
      Batal
    </button>
  );
}

export function ConfirmDelete({
  action,
  hiddenFields,
  id,
  label,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields?: Record<string, string>;
  id: string;
  label: string;
}) {
  return (
    <Modal
      size="sm"
      title={`Hapus ${label}?`}
      description="Data akan dihapus dari daftar aktif."
      trigger={
        <button
          aria-label={`Hapus ${label}`}
          className="btn-icon btn-delete"
          title={`Hapus ${label}`}
          type="button"
        >
          <Trash2 size={15} />
        </button>
      }
    >
      <form action={action} className="form-stack">
        <input name="id" type="hidden" value={id} />
        {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
          <input key={name} name={name} type="hidden" value={value} />
        ))}
        <p className="text-sm text-slate-600">Riwayat transaksi dan relasi yang sudah tersimpan tetap dipertahankan.</p>
        <div className="form-actions">
          <ModalCancelButton />
          <button className="btn btn-delete" type="submit">Hapus</button>
        </div>
      </form>
    </Modal>
  );
}
