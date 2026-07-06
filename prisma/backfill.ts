import { PaymentType, PrismaClient, UserRole } from "@prisma/client";
import { postExpenseAccounting, postPaymentAccounting } from "../lib/accounting";
import { defaultPermissions } from "../lib/permissions";

const prisma = new PrismaClient();

async function main() {
  for (const role of Object.values(UserRole)) {
    for (const permission of defaultPermissions[role]) {
      await prisma.rolePermission.upsert({
        where: { role_permission: { role, permission } },
        create: { role, permission, allowed: true },
        update: {},
      });
    }
  }

  const accounts = await prisma.account.findMany();
  const operationalAccount = accounts.find((account) => account.code === "5101");
  const activityAccount = accounts.find((account) => account.code === "5201");
  const categorySeeds = [
    {
      code: "OPERASIONAL",
      name: "Operasional Sekolah",
      description: "ATK, utilitas, pemeliharaan, dan kebutuhan tata usaha",
      expenseAccountId: operationalAccount?.id,
      aliases: ["operasional"],
    },
    {
      code: "KEGIATAN_SISWA",
      name: "Kegiatan Siswa",
      description: "Kegiatan akademik dan nonakademik siswa",
      expenseAccountId: activityAccount?.id,
      aliases: ["kegiatan", "kegiatan siswa"],
    },
    {
      code: "SARANA",
      name: "Sarana dan Prasarana",
      description: "Pengadaan dan perawatan fasilitas sekolah",
      expenseAccountId: operationalAccount?.id,
      aliases: ["sarana", "sarana dan prasarana"],
    },
  ];

  for (const seed of categorySeeds) {
    const category = await prisma.expenseCategory.upsert({
      where: { code: seed.code },
      create: {
        code: seed.code,
        name: seed.name,
        description: seed.description,
        expenseAccountId: seed.expenseAccountId,
      },
      update: {},
    });
    await prisma.expense.updateMany({
      where: {
        categoryId: null,
        categoryNameSnapshot: { in: seed.aliases, mode: "insensitive" },
      },
      data: { categoryId: category.id, categoryNameSnapshot: category.name },
    });
  }

  const fallbackCategory = await prisma.expenseCategory.findUnique({
    where: { code: "OPERASIONAL" },
  });
  if (fallbackCategory) {
    await prisma.expense.updateMany({
      where: { categoryId: null },
      data: { categoryId: fallbackCategory.id },
    });
  }

  const paymentCategories = await prisma.paymentCategory.findMany();
  for (const category of paymentCategories) {
    const validTypes: PaymentType[] = ["SPP", "SUMBANGAN", "KEGIATAN", "SERAGAM", "LAINNYA"];
    const type = validTypes.includes(category.code as PaymentType)
      ? category.code as PaymentType
      : PaymentType.LAINNYA;
    await prisma.invoice.updateMany({
      where: { paymentCategoryId: null, type },
      data: { paymentCategoryId: category.id },
    });
  }

  const legacyInvoices = await prisma.invoice.findMany({
    where: {
      OR: [{ academicYear: null }, { period: null }],
    },
    select: { id: true, dueDate: true },
  });
  for (const invoice of legacyInvoices) {
    const year = invoice.dueDate.getFullYear();
    const month = invoice.dueDate.getMonth() + 1;
    const academicStart = month >= 7 ? year : year - 1;
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        academicYear: `${academicStart}/${academicStart + 1}`,
        period: `${year}-${String(month).padStart(2, "0")}`,
      },
    });
  }

  const missingPaymentCategories = Object.values(PaymentType).filter(
    (code) => !paymentCategories.some((category) => category.code === code),
  );
  if (missingPaymentCategories.length) {
    throw new Error(`Jenis pembayaran belum lengkap: ${missingPaymentCategories.join(", ")}`);
  }

  const defaultCashAccount = await prisma.account.findFirst({
    where: {
      code: "1101",
      type: "ASET",
      active: true,
      deletedAt: null,
    },
  });
  if (!defaultCashAccount) {
    throw new Error("Akun kas aktif dengan kode 1101 belum tersedia.");
  }

  const legacyPayments = await prisma.payment.findMany({
    where: { deletedAt: null, cashEntry: null },
    include: {
      invoice: true,
    },
  });
  for (const payment of legacyPayments) {
    const existingJournal = await prisma.journalEntry.findFirst({
      where: {
        sourceType: "PAYMENT",
        sourceId: payment.id,
        deletedAt: null,
      },
    });
    if (existingJournal) {
      throw new Error(`Pembayaran ${payment.id} memiliki jurnal tetapi belum memiliki transaksi kas.`);
    }

    await prisma.$transaction((tx) => postPaymentAccounting(tx, {
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      assetAccountId: defaultCashAccount.id,
      amount: payment.amount,
      date: payment.paidAt,
      description: `Pembayaran ${payment.invoice.title}`,
      createdBy: payment.receivedBy,
    }));
  }

  const legacyExpenses = await prisma.expense.findMany({
    where: { deletedAt: null, cashEntry: null },
    include: {
      categoryRef: true,
    },
  });
  for (const expense of legacyExpenses) {
    const existingJournal = await prisma.journalEntry.findFirst({
      where: {
        sourceType: "EXPENSE",
        sourceId: expense.id,
        deletedAt: null,
      },
    });
    if (existingJournal) {
      throw new Error(`Pengeluaran ${expense.id} memiliki jurnal tetapi belum memiliki transaksi kas.`);
    }

    await prisma.$transaction((tx) => postExpenseAccounting(tx, {
      expenseId: expense.id,
      assetAccountId: defaultCashAccount.id,
      amount: expense.amount,
      date: expense.spentAt,
      description: expense.title,
      createdBy: expense.createdBy,
      expenseAccountId: expense.categoryRef?.expenseAccountId,
    }));
  }
}

main()
  .finally(async () => prisma.$disconnect());
