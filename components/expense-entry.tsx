"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { createExpense } from "@/app/actions";
import { ModalCancelButton } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { currency } from "@/lib/format";

type ExpenseLine = {
  key: string;
  categoryId: string;
  amount: number;
};

function newLine(categoryId = ""): ExpenseLine {
  return {
    key: crypto.randomUUID(),
    categoryId,
    amount: 0,
  };
}

export function ExpenseEntry({
  assetAccounts,
  categories,
  createdBy,
  fixedCategory,
  returnTo,
}: {
  assetAccounts: { id: string; code: string; name: string }[];
  categories: { id: string; name: string }[];
  createdBy: string;
  fixedCategory?: { id: string; name: string };
  returnTo?: string;
}) {
  const [lines, setLines] = useState<ExpenseLine[]>(() => [newLine(fixedCategory?.id)]);
  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.amount, 0),
    [lines],
  );

  function updateLine(key: string, next: Partial<ExpenseLine>) {
    setLines((current) =>
      current.map((line) => line.key === key ? { ...line, ...next } : line),
    );
  }

  function removeLine(key: string) {
    setLines((current) => current.length === 1
      ? current
      : current.filter((line) => line.key !== key));
  }

  return (
    <form action={createExpense} className="form-stack">
      <input name="createdBy" type="hidden" value={createdBy} />
      {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
      <div className="field-grid">
        <label>
          Tanggal Nota
          <input defaultValue={new Date().toISOString().slice(0, 10)} name="spentAt" required type="date" />
        </label>
        <label>
          Kas / Bank
          <select defaultValue="" name="assetAccountId" required>
            <option value="">Pilih kas / bank</option>
            {assetAccounts.map((account) => (
              <option key={account.id} value={account.id}>{account.code} - {account.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="batch-lines">
        {lines.map((line, index) => (
          <section className="batch-line" key={line.key}>
            <div className="batch-line-head">
              <strong>Item {index + 1}</strong>
              <button
                aria-label="Hapus item"
                className="btn-icon btn-delete"
                disabled={lines.length === 1}
                onClick={() => removeLine(line.key)}
                title="Hapus item"
                type="button"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="field-grid">
              {fixedCategory ? (
                <label>
                  Kategori
                  <input name="categoryId" type="hidden" value={fixedCategory.id} />
                  <div className="readonly-field">{fixedCategory.name}</div>
                </label>
              ) : (
                <label>
                  Kategori
                  <select
                    name="categoryId"
                    onChange={(event) => updateLine(line.key, { categoryId: event.target.value })}
                    required
                    value={line.categoryId}
                  >
                    <option value="">Pilih kategori</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Nominal
                <MoneyInput
                  key={line.key}
                  name="amount"
                  onValueChange={(amount) => updateLine(line.key, { amount })}
                />
              </label>
            </div>
            <label>
              Keperluan
              <input name="title" required />
            </label>
            <div className="field-grid">
              <label>
                Vendor
                <input name="vendor" />
              </label>
              <label>
                Catatan
                <input name="note" />
              </label>
            </div>
          </section>
        ))}
      </div>

      <div className="invoice-selection-summary">
        <span>{lines.length} item dalam satu nota</span>
        <strong>Total {currency(total)}</strong>
      </div>
      <div className="form-actions">
        <button
          className="btn btn-secondary"
          onClick={() => setLines((current) => [...current, newLine(fixedCategory?.id)])}
          type="button"
        >
          <Plus size={16} /> Tambah Item
        </button>
        <ModalCancelButton />
        <button className="btn btn-save" type="submit">Simpan Nota</button>
      </div>
    </form>
  );
}
