"use client";

import { ArrowLeft, CheckCircle2, Search, UserRoundCheck } from "lucide-react";
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
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const selectedStudent = students.find((student) => student.id === studentId);
  const selectedInvoices = selectedStudent?.invoices.filter((invoice) =>
    selectedInvoiceIds.includes(invoice.id),
  ) ?? [];
  const totalSelected = selectedInvoices.reduce(
    (sum, invoice) => sum + (amounts[invoice.id] ?? invoice.remaining),
    0,
  );
  const results = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("id-ID");
    if (!keyword) return students.slice(0, 8);
    return students.filter((student) =>
      [student.name, student.nisn, student.className].some((value) =>
        value.toLocaleLowerCase("id-ID").includes(keyword),
      ),
    ).slice(0, 8);
  }, [query, students]);

  function selectStudent(nextStudent: PaymentEntryStudent) {
    const firstInvoice = nextStudent.invoices[0];
    setStudentId(nextStudent.id);
    setSelectedInvoiceIds(firstInvoice ? [firstInvoice.id] : []);
    setAmounts(firstInvoice ? { [firstInvoice.id]: firstInvoice.remaining } : {});
  }

  function toggleInvoice(invoice: PaymentEntryStudent["invoices"][number]) {
    setSelectedInvoiceIds((current) => {
      if (current.includes(invoice.id)) {
        return current.filter((id) => id !== invoice.id);
      }
      return [...current, invoice.id];
    });
    setAmounts((current) => ({
      ...current,
      [invoice.id]: current[invoice.id] ?? invoice.remaining,
    }));
  }

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
              onClick={() => selectStudent(student)}
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
            setSelectedInvoiceIds([]);
            setAmounts({});
          }}
          type="button"
        >
          <ArrowLeft size={16} /> Ganti Siswa
        </button>
      </div>
      <div className="batch-lines">
        {selectedStudent.invoices.map((invoice) => {
          const selected = selectedInvoiceIds.includes(invoice.id);
          return (
            <section className={`batch-line ${selected ? "selected" : ""}`} key={invoice.id}>
              <div className="batch-line-head">
                <label className="checkbox-row">
                  <input
                    checked={selected}
                    onChange={() => toggleInvoice(invoice)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{invoice.title}</strong>
                    <small>{invoice.category} · tempo {invoice.dueDate} · sisa {currency(invoice.remaining)}</small>
                  </span>
                </label>
                {selected ? <span className="badge green"><CheckCircle2 size={14} /> Dipilih</span> : null}
              </div>
              {selected ? (
                <div className="field-grid">
                  <input name="invoiceId" type="hidden" value={invoice.id} />
                  <label>
                    Nominal Bayar
                    <MoneyInput
                      defaultValue={invoice.remaining}
                      key={invoice.id}
                      name="amount"
                      onValueChange={(amount) =>
                        setAmounts((current) => ({ ...current, [invoice.id]: amount }))
                      }
                    />
                  </label>
                  <div className="invoice-selection-summary compact">
                    <span>Maksimal bayar</span>
                    <strong>{currency(invoice.remaining)}</strong>
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      <div className="invoice-selection-summary">
        <span>{selectedInvoices.length} tagihan dalam satu kwitansi</span>
        <strong>Total {currency(totalSelected)}</strong>
      </div>
      <div className="field-grid">
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
        <button className="btn btn-save" disabled={!selectedInvoices.length} type="submit">Simpan & Buat Kwitansi</button>
      </div>
    </form>
  );
}
