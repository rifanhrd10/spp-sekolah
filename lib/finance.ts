import type { Invoice } from "@prisma/client";

export type InvoiceWithPayments = Invoice & {
  payments: {
    amount: number;
  }[];
};

export function paidTotal(invoice: { payments: { amount: number }[] }) {
  return invoice.payments.reduce((total, payment) => total + payment.amount, 0);
}

export function remainingTotal(invoice: { amount: number; payments: { amount: number }[] }) {
  return Math.max(invoice.amount - paidTotal(invoice), 0);
}

export function financeSummary(
  invoices: { amount: number; payments: { amount: number }[] }[],
  expenses: { amount: number }[],
  cashTransactions?: { amount: number; type: "MASUK" | "KELUAR" }[],
) {
  const totalBills = invoices.reduce((total, invoice) => total + invoice.amount, 0);
  const totalPaid = invoices.reduce((total, invoice) => total + paidTotal(invoice), 0);
  const totalRemaining = Math.max(totalBills - totalPaid, 0);
  const totalExpenses = expenses.reduce((total, expense) => total + expense.amount, 0);
  const balance = cashTransactions
    ? cashTransactions.reduce(
        (total, transaction) =>
          total + (transaction.type === "MASUK" ? transaction.amount : -transaction.amount),
        0,
      )
    : totalPaid - totalExpenses;

  return {
    totalBills,
    totalPaid,
    totalRemaining,
    totalExpenses,
    balance,
  };
}
