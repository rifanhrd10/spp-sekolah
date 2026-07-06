import { PermissionKey } from "@prisma/client";
import {
  Banknote,
  CircleAlert,
  CircleCheckBig,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { paidTotal, remainingTotal } from "@/lib/finance";
import { currency, paymentTypeLabel } from "@/lib/format";
import { prisma } from "@/lib/prisma";

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

export default async function AnalyticsPage() {
  await requirePermission(PermissionKey.ANALYTICS_VIEW);
  const [invoices, expenses, students] = await Promise.all([
    prisma.invoice.findMany({
      where: { deletedAt: null },
      include: {
        payments: { where: { deletedAt: null }, select: { amount: true, paidAt: true } },
        student: { include: { classRoom: true } },
        paymentCategory: true,
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.expense.findMany({
      where: { deletedAt: null },
      include: { categoryRef: true },
      orderBy: { spentAt: "desc" },
    }),
    prisma.student.count({ where: { active: true, deletedAt: null } }),
  ]);
  const billed = invoices.reduce((total, invoice) => total + invoice.amount, 0);
  const collected = invoices.reduce((total, invoice) => total + paidTotal(invoice), 0);
  const outstanding = invoices.reduce((total, invoice) => total + remainingTotal(invoice), 0);
  const expenseTotal = expenses.reduce((total, expense) => total + expense.amount, 0);
  const collectionRate = percent(collected, billed);

  const byClass = Array.from(invoices.reduce((map, invoice) => {
    const className = invoice.student.classRoom?.name ?? invoice.student.classNameSnapshot ?? "-";
    const row = map.get(className) ?? { billed: 0, paid: 0 };
    row.billed += invoice.amount;
    row.paid += paidTotal(invoice);
    map.set(className, row);
    return map;
  }, new Map<string, { billed: number; paid: number }>())).sort(([left], [right]) => left.localeCompare(right));

  const byCategory = Array.from(expenses.reduce((map, expense) => {
    const name = expense.categoryRef?.name ?? expense.categoryNameSnapshot ?? "-";
    map.set(name, (map.get(name) ?? 0) + expense.amount);
    return map;
  }, new Map<string, number>())).sort((left, right) => right[1] - left[1]);

  const byPaymentType = Array.from(invoices.reduce((map, invoice) => {
    const name = invoice.paymentCategory?.name ?? paymentTypeLabel(invoice.type);
    const row = map.get(name) ?? { billed: 0, paid: 0 };
    row.billed += invoice.amount;
    row.paid += paidTotal(invoice);
    map.set(name, row);
    return map;
  }, new Map<string, { billed: number; paid: number }>())).sort((left, right) => right[1].billed - left[1].billed);

  const overdue = invoices.filter((invoice) => remainingTotal(invoice) > 0 && invoice.dueDate < new Date());
  const paidStudents = new Set(invoices.filter((invoice) => paidTotal(invoice) > 0).map((invoice) => invoice.studentId)).size;
  const maxClassBilled = Math.max(...byClass.map(([, row]) => row.billed), 1);
  const maxExpense = Math.max(...byCategory.map(([, amount]) => amount), 1);

  return (
    <main className="page analytics-page">
      <section className="analytics-summary">
        <div className="analysis-metric primary">
          <span><ReceiptText size={18} /> Total Tagihan</span>
          <strong>{currency(billed)}</strong>
          <small>{invoices.length} tagihan dari {students} siswa aktif</small>
        </div>
        <div className="analysis-metric success">
          <span><Banknote size={18} /> Terkumpul</span>
          <strong>{currency(collected)}</strong>
          <small>{collectionRate}% tingkat penagihan</small>
        </div>
        <div className="analysis-metric warning">
          <span><CircleAlert size={18} /> Belum Tertagih</span>
          <strong>{currency(outstanding)}</strong>
          <small>{overdue.length} tagihan melewati tempo</small>
        </div>
        <div className="analysis-metric danger">
          <span><TrendingDown size={18} /> Pengeluaran</span>
          <strong>{currency(expenseTotal)}</strong>
          <small>Saldo bersih {currency(collected - expenseTotal)}</small>
        </div>
      </section>

      <section className="analysis-insights">
        <div><CircleCheckBig size={20} /><span><strong>{paidStudents} siswa</strong> sudah memiliki pembayaran tercatat.</span></div>
        <div><Users size={20} /><span><strong>{students - paidStudents} siswa</strong> belum memiliki pembayaran pada data berjalan.</span></div>
        <div><TrendingUp size={20} /><span><strong>{collectionRate}%</strong> dari seluruh nilai tagihan berhasil diterima.</span></div>
      </section>

      <section className="analytics-grid">
        <div className="panel analysis-panel">
          <div className="panel-heading"><div><span>Performa Penagihan</span><h2>Realisasi per Kelas</h2></div></div>
          <div className="bar-list">
            {byClass.length ? byClass.map(([className, row]) => (
              <div className="bar-row" key={className}>
                <div className="bar-label"><strong>{className}</strong><span>{currency(row.paid)} dari {currency(row.billed)}</span></div>
                <div className="bar-track">
                  <span className="bar-total" style={{ width: `${Math.max((row.billed / maxClassBilled) * 100, 2)}%` }} />
                  <span className="bar-value" style={{ width: `${Math.max((row.paid / maxClassBilled) * 100, 0)}%` }} />
                </div>
                <strong className="bar-percent">{percent(row.paid, row.billed)}%</strong>
              </div>
            )) : <div className="empty-state">Belum ada data tagihan per kelas.</div>}
          </div>
        </div>

        <div className="panel analysis-panel">
          <div className="panel-heading"><div><span>Komposisi Biaya</span><h2>Pengeluaran per Kategori</h2></div></div>
          <div className="bar-list expense-bars">
            {byCategory.length ? byCategory.map(([name, amount]) => (
              <div className="bar-row" key={name}>
                <div className="bar-label"><strong>{name}</strong><span>{currency(amount)}</span></div>
                <div className="bar-track"><span className="bar-value" style={{ width: `${Math.max((amount / maxExpense) * 100, 3)}%` }} /></div>
                <strong className="bar-percent">{percent(amount, expenseTotal)}%</strong>
              </div>
            )) : <div className="empty-state">Belum ada data pengeluaran.</div>}
          </div>
        </div>

        <div className="panel analysis-panel full">
          <div className="panel-heading"><div><span>Jenis Pembayaran</span><h2>Kontribusi dan Sisa Tagihan</h2></div></div>
          <div className="analysis-table-wrap">
            <table>
              <thead><tr><th className="table-number">No</th><th>Jenis Pembayaran</th><th>Tagihan</th><th>Diterima</th><th>Sisa</th><th>Realisasi</th></tr></thead>
              <tbody>
                {byPaymentType.length ? byPaymentType.map(([name, row], index) => (
                  <tr key={name}>
                    <td className="table-number">{index + 1}</td>
                    <td><strong>{name}</strong></td>
                    <td className="money">{currency(row.billed)}</td>
                    <td className="money green">{currency(row.paid)}</td>
                    <td className="money amber">{currency(row.billed - row.paid)}</td>
                    <td><span className="rate-pill">{percent(row.paid, row.billed)}%</span></td>
                  </tr>
                )) : <tr><td className="empty" colSpan={6}>Belum ada data tagihan berdasarkan jenis pembayaran.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
