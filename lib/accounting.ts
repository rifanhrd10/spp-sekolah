import { Prisma, type PrismaClient } from "@prisma/client";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

function serial(prefix: string) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export function receiptNumber() {
  return serial("KWT");
}

export async function postPaymentAccounting(
  tx: TransactionClient,
  input: {
    paymentId: string;
    invoiceId: string;
    assetAccountId: string;
    amount: number;
    date: Date;
    description: string;
    createdBy: string;
  },
) {
  const [cash, invoice] = await Promise.all([
    tx.account.findUniqueOrThrow({ where: { id: input.assetAccountId } }),
    tx.invoice.findUniqueOrThrow({
      where: { id: input.invoiceId },
      include: {
        paymentCategory: {
          include: { revenueAccount: true },
        },
      },
    }),
  ]);
  const revenue = invoice.paymentCategory?.revenueAccount
    ?? await tx.account.findUniqueOrThrow({ where: { code: "4101" } });

  await tx.cashTransaction.create({
    data: {
      type: "MASUK",
      date: input.date,
      amount: input.amount,
      description: input.description,
      reference: input.paymentId,
      paymentId: input.paymentId,
      assetAccountId: cash.id,
      contraAccountId: revenue.id,
      createdBy: input.createdBy,
    },
  });

  await tx.journalEntry.create({
    data: {
      number: serial("JU"),
      date: input.date,
      description: input.description,
      sourceType: "PAYMENT",
      sourceId: input.paymentId,
      postedBy: input.createdBy,
      lines: {
        create: [
          { accountId: cash.id, debit: input.amount, credit: 0 },
          { accountId: revenue.id, debit: 0, credit: input.amount },
        ],
      },
    },
  });
}

export async function postExpenseAccounting(
  tx: TransactionClient,
  input: {
    expenseId: string;
    assetAccountId: string;
    amount: number;
    date: Date;
    description: string;
    createdBy: string;
    expenseAccountId?: string | null;
  },
) {
  const [cash, expense] = await Promise.all([
    tx.account.findUniqueOrThrow({ where: { id: input.assetAccountId } }),
    input.expenseAccountId
      ? tx.account.findUniqueOrThrow({ where: { id: input.expenseAccountId } })
      : tx.account.findUniqueOrThrow({ where: { code: "5101" } }),
  ]);

  await tx.cashTransaction.create({
    data: {
      type: "KELUAR",
      date: input.date,
      amount: input.amount,
      description: input.description,
      reference: input.expenseId,
      expenseId: input.expenseId,
      assetAccountId: cash.id,
      contraAccountId: expense.id,
      createdBy: input.createdBy,
    },
  });

  await tx.journalEntry.create({
    data: {
      number: serial("JU"),
      date: input.date,
      description: input.description,
      sourceType: "EXPENSE",
      sourceId: input.expenseId,
      postedBy: input.createdBy,
      lines: {
        create: [
          { accountId: expense.id, debit: input.amount, credit: 0 },
          { accountId: cash.id, debit: 0, credit: input.amount },
        ],
      },
    },
  });
}

export function assertBalanced(lines: { debit: number; credit: number }[]) {
  const debit = lines.reduce((total, line) => total + line.debit, 0);
  const credit = lines.reduce((total, line) => total + line.credit, 0);
  if (debit <= 0 || debit !== credit) {
    throw new Error("Jurnal harus seimbang dan memiliki nilai lebih dari nol.");
  }
}
