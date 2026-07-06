"use client";

import { ArrowLeft, Search, UserRoundCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { recordPayment } from "@/app/actions";
import { currency } from "@/lib/format";
import { MoneyInput } from "@/components/money-input";
import { ModalCancelButton } from "@/components/modal";

export type PaymentEntryStudent = {
  id: string;
  name: string;
  nisn: string;
  className: string;
  invoices: {
    id: string;
    title: string;
    category: string;
    dueDate: string;
    remaining: number;
  }[];
};

export function PaymentEntry({
  students,
  receivedBy,
  assetAccounts,
}: {
  students: PaymentEntryStudent[];
  receivedBy: string;
  assetAccounts: { id: string; code: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [studentId, setStudentId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const selectedStudent = students.find((student) => student.id === studentId);
  const selectedInvoice = selectedStudent?.invoices.find((invoice) => invoice.id === invoiceId);
  const results = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("id-ID");
    if (!keyword) return students.slice(0, 8);
    return students.filter((student) =>
      [student.name, student.nisn, student.className].some((value) =>
        value.toLocaleLowerCase("id-ID").includes(keyword),
      ),
    ).slice(0, 8);
  }, [query, students]);

  if (!selectedStudent) {
    return (
      <div className="payment-picker">
        <label className="payment-search">
          <span>Cari Siswa</span>
          <div className="input-with-icon">
            <Search size={17} />
            <input
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ketik nama, NISN, atau kelas"
              value={query}
            />
          </div>
        </label>
        <div className="payment-results">
          {results.length ? results.map((student) => (
            <button
              className="student-result"
              key={student.id}
              onClick={() => {
                setStudentId(student.id);
                setInvoiceId(student.invoices[0]?.id ?? "");
              }}
              type="button"
            >
              <span className="student-result-icon"><UserRoundCheck size={18} /></span>
              <span>
                <strong>{student.name}</strong>
                <small>NISN {student.nisn} · {student.className}</small>
              </span>
              <span className="student-debt">{student.invoices.length} tagihan</span>
            </button>
          )) : (
            <div className="empty-state">Siswa dengan tagihan aktif tidak ditemukan.</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={recordPayment} className="form-stack">
      <input name="receivedBy" type="hidden" value={receivedBy} />
      <div className="selected-student">
        <div>
          <span>Siswa Terpilih</span>
          <strong>{selectedStudent.name}</strong>
          <small>NISN {selectedStudent.nisn} · {selectedStudent.className}</small>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setStudentId("");
            setInvoiceId("");
          }}
          type="button"
        >
          <ArrowLeft size={16} /> Ganti Siswa
        </button>
      </div>
      <label>
        Tagihan yang Dibayar
        <select
          name="invoiceId"
          onChange={(event) => setInvoiceId(event.target.value)}
          required
          value={invoiceId}
        >
          {selectedStudent.invoices.map((invoice) => (
            <option key={invoice.id} value={invoice.id}>
              {invoice.title} · {invoice.category} · sisa {currency(invoice.remaining)}
            </option>
          ))}
        </select>
      </label>
      {selectedInvoice ? (
        <div className="invoice-selection-summary">
          <span>Jatuh tempo {selectedInvoice.dueDate}</span>
          <strong>Sisa {currency(selectedInvoice.remaining)}</strong>
        </div>
      ) : null}
      <div className="field-grid">
        <label>
          Nominal Bayar
          <MoneyInput
            key={selectedInvoice?.id}
            defaultValue={selectedInvoice?.remaining}
            name="amount"
          />
        </label>
        <label>
          Tanggal
          <input defaultValue={new Date().toISOString().slice(0, 10)} name="paidAt" required type="date" />
        </label>
      </div>
      <div className="field-grid">
        <label>
          Metode
          <select name="method">
            <option>Tunai</option>
            <option>Transfer</option>
            <option>QRIS</option>
          </select>
        </label>
        <label>
          Kas / Bank
          <select defaultValue="" name="assetAccountId" required>
            <option disabled value="">Pilih kas / bank</option>
            {assetAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-grid">
        <label>
          Petugas
          <input disabled value={receivedBy} />
        </label>
        <label>
          Catatan
          <input name="note" placeholder="Opsional" />
        </label>
      </div>
      <div className="form-actions">
        <ModalCancelButton />
        <button className="btn btn-save" type="submit">Simpan & Buat Kwitansi</button>
      </div>
    </form>
  );
}
