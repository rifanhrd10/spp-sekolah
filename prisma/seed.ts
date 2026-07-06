import {
  AccountType,
  InvoiceStatus,
  PaymentType,
  PermissionKey,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import { hashPassword } from "../lib/password";
import { defaultPermissions } from "../lib/permissions";

const prisma = new PrismaClient();

async function main() {
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.cashTransaction.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.billingBatch.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.expenseCategory.deleteMany();
  await prisma.studentClassHistory.deleteMany();
  await prisma.student.deleteMany();
  await prisma.paymentCategory.deleteMany();
  await prisma.classRoom.deleteMany();
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.account.deleteMany();
  await prisma.receiptSetting.deleteMany();

  await prisma.rolePermission.createMany({
    data: Object.entries(defaultPermissions).flatMap(([role, permissions]) =>
      permissions.map((permission) => ({
        role: role as UserRole,
        permission: permission as PermissionKey,
        allowed: true,
      })),
    ),
  });

  const accounts = await Promise.all([
    prisma.account.create({ data: { code: "1101", name: "Kas Sekolah", type: AccountType.ASET } }),
    prisma.account.create({ data: { code: "1102", name: "Bank Sekolah", type: AccountType.ASET } }),
    prisma.account.create({ data: { code: "4101", name: "Pendapatan Pendidikan", type: AccountType.PENDAPATAN } }),
    prisma.account.create({ data: { code: "4201", name: "Pendapatan Lain-lain", type: AccountType.PENDAPATAN } }),
    prisma.account.create({ data: { code: "5101", name: "Beban Operasional Sekolah", type: AccountType.BEBAN } }),
    prisma.account.create({ data: { code: "5201", name: "Beban Kegiatan Siswa", type: AccountType.BEBAN } }),
  ]);

  await prisma.receiptSetting.create({
    data: {
      schoolName: "SMP Nusantara",
      schoolAddress: "Jl. Pendidikan No. 10, Indonesia",
      schoolPhone: "(021) 555-0123",
      headerText: "KWITANSI PEMBAYARAN",
      footerText: "Terima kasih. Simpan kwitansi ini sebagai bukti pembayaran yang sah.",
      signatureName: "Ibu Maya",
      signatureTitle: "Bendahara Sekolah",
    },
  });

  await prisma.user.createMany({
    data: [
      {
        name: "Administrator",
        email: "admin@smp.local",
        passwordHash: hashPassword("admin123"),
        role: UserRole.ADMIN,
      },
      {
        name: "Ibu Maya",
        email: "bendahara@smp.local",
        passwordHash: hashPassword("bendahara123"),
        role: UserRole.BENDAHARA,
      },
      {
        name: "Pak Arman",
        email: "kepala@smp.local",
        passwordHash: hashPassword("kepala123"),
        role: UserRole.KEPALA_SEKOLAH,
      },
    ],
  });

  const [viiA, viiB, viiiA, viiiB, ixA, ixB, ixC] = await Promise.all([
    prisma.classRoom.create({ data: { name: "VII-A", level: "VII", homeroom: "Ibu Ratri" } }),
    prisma.classRoom.create({ data: { name: "VII-B", level: "VII", homeroom: "Pak Dani" } }),
    prisma.classRoom.create({ data: { name: "VIII-A", level: "VIII", homeroom: "Pak Reza" } }),
    prisma.classRoom.create({ data: { name: "VIII-B", level: "VIII", homeroom: "Ibu Laila" } }),
    prisma.classRoom.create({ data: { name: "IX-A", level: "IX", homeroom: "Ibu Fitri" } }),
    prisma.classRoom.create({ data: { name: "IX-B", level: "IX", homeroom: "Pak Adi" } }),
    prisma.classRoom.create({ data: { name: "IX-C", level: "IX", homeroom: "Pak Fajar" } }),
  ]);
  void viiiA;
  void ixA;
  void ixB;

  const paymentCategories = await prisma.paymentCategory.createManyAndReturn({
    data: [
      {
        code: PaymentType.SPP,
        name: "SPP Bulanan",
        defaultAmount: 250000,
        description: "Iuran wajib bulanan siswa",
      },
      {
        code: PaymentType.SUMBANGAN,
        name: "Sumbangan Sekolah",
        defaultAmount: 100000,
        description: "Sumbangan sarana dan prasarana",
      },
      {
        code: PaymentType.KEGIATAN,
        name: "Kegiatan Siswa",
        defaultAmount: 175000,
        description: "Pembiayaan kegiatan sekolah",
      },
      {
        code: PaymentType.SERAGAM,
        name: "Seragam",
        defaultAmount: 180000,
        description: "Pembayaran kebutuhan seragam",
      },
      {
        code: PaymentType.LAINNYA,
        name: "Lain-lain",
        defaultAmount: 0,
        description: "Pembayaran non-rutin",
      },
    ],
  });
  const paymentCategoryByCode = new Map(paymentCategories.map((category) => [category.code, category]));

  const expenseCategories = await prisma.expenseCategory.createManyAndReturn({
    data: [
      {
        code: "OPERASIONAL",
        name: "Operasional Sekolah",
        description: "ATK, utilitas, pemeliharaan, dan kebutuhan tata usaha",
        expenseAccountId: accounts.find((account) => account.code === "5101")?.id,
      },
      {
        code: "KEGIATAN_SISWA",
        name: "Kegiatan Siswa",
        description: "Kegiatan akademik dan nonakademik siswa",
        expenseAccountId: accounts.find((account) => account.code === "5201")?.id,
      },
      {
        code: "SARANA",
        name: "Sarana dan Prasarana",
        description: "Pengadaan dan perawatan fasilitas sekolah",
        expenseAccountId: accounts.find((account) => account.code === "5101")?.id,
      },
    ],
  });
  const expenseCategoryByCode = new Map(expenseCategories.map((category) => [category.code, category]));

  const students = await Promise.all([
    prisma.student.create({
      data: {
        nisn: "0076123451",
        name: "Alya Putri",
        classNameSnapshot: viiA.name,
        classRoomId: viiA.id,
        guardianName: "Rini Hartati",
        phone: "081234567001",
      },
    }),
    prisma.student.create({
      data: {
        nisn: "0076123452",
        name: "Bima Pratama",
        classNameSnapshot: viiA.name,
        classRoomId: viiA.id,
        guardianName: "Dedi Suhendar",
        phone: "081234567002",
      },
    }),
    prisma.student.create({
      data: {
        nisn: "0076123453",
        name: "Citra Lestari",
        classNameSnapshot: viiiB.name,
        classRoomId: viiiB.id,
        guardianName: "Sri Wahyuni",
        phone: "081234567003",
      },
    }),
    prisma.student.create({
      data: {
        nisn: "0076123454",
        name: "Dimas Nugraha",
        classNameSnapshot: ixC.name,
        classRoomId: ixC.id,
        guardianName: "Agus Setiawan",
        phone: "081234567004",
      },
    }),
    prisma.student.create({
      data: {
        nisn: "0076123455",
        name: "Eka Ramadhan",
        classNameSnapshot: viiB.name,
        classRoomId: viiB.id,
        guardianName: "Nina Marlina",
        phone: "081234567005",
      },
    }),
  ]);

  const sppAlya = await prisma.invoice.create({
    data: {
      studentId: students[0].id,
      paymentCategoryId: paymentCategoryByCode.get(PaymentType.SPP)?.id,
      type: PaymentType.SPP,
      title: "SPP Juli 2026",
      amount: 250000,
      dueDate: new Date("2026-07-10"),
      status: InvoiceStatus.CICILAN,
      academicYear: "2026/2027",
      period: "2026-07",
      description: "Iuran bulanan",
    },
  });

  const sppBima = await prisma.invoice.create({
    data: {
      studentId: students[1].id,
      paymentCategoryId: paymentCategoryByCode.get(PaymentType.SPP)?.id,
      type: PaymentType.SPP,
      title: "SPP Juli 2026",
      amount: 250000,
      dueDate: new Date("2026-07-10"),
      status: InvoiceStatus.LUNAS,
      academicYear: "2026/2027",
      period: "2026-07",
      description: "Iuran bulanan",
    },
  });

  await prisma.invoice.createMany({
    data: [
      {
        studentId: students[2].id,
        paymentCategoryId: paymentCategoryByCode.get(PaymentType.KEGIATAN)?.id,
        type: PaymentType.KEGIATAN,
        title: "Kegiatan Tengah Semester",
        amount: 175000,
        dueDate: new Date("2026-07-20"),
        status: InvoiceStatus.BELUM_BAYAR,
        academicYear: "2026/2027",
        period: "2026-07",
        description: "Belum ada pembayaran masuk",
      },
      {
        studentId: students[0].id,
        paymentCategoryId: paymentCategoryByCode.get(PaymentType.SUMBANGAN)?.id,
        type: PaymentType.SUMBANGAN,
        title: "Sumbangan Sarana Kelas",
        amount: 100000,
        dueDate: new Date("2026-07-25"),
        status: InvoiceStatus.BELUM_BAYAR,
        academicYear: "2026/2027",
        period: "2026-07",
      },
      {
        studentId: students[3].id,
        paymentCategoryId: paymentCategoryByCode.get(PaymentType.SERAGAM)?.id,
        type: PaymentType.SERAGAM,
        title: "Seragam Olahraga",
        amount: 180000,
        dueDate: new Date("2026-07-18"),
        status: InvoiceStatus.BELUM_BAYAR,
        academicYear: "2026/2027",
        period: "2026-07",
      },
      {
        studentId: students[4].id,
        paymentCategoryId: paymentCategoryByCode.get(PaymentType.SPP)?.id,
        type: PaymentType.SPP,
        title: "SPP Juli 2026",
        amount: 250000,
        dueDate: new Date("2026-07-10"),
        status: InvoiceStatus.BELUM_BAYAR,
        academicYear: "2026/2027",
        period: "2026-07",
      },
    ],
  });

  const paymentAlya = await prisma.payment.create({
    data: {
        invoiceId: sppAlya.id,
        receiptNo: "KWT-20260703-0001",
        amount: 150000,
        paidAt: new Date("2026-07-03"),
        method: "Transfer",
        note: "Cicilan pertama",
        receivedBy: "Ibu Maya",
      },
  });
  const paymentBima = await prisma.payment.create({
    data: {
        invoiceId: sppBima.id,
        receiptNo: "KWT-20260702-0002",
        amount: 250000,
        paidAt: new Date("2026-07-02"),
        method: "Tunai",
        note: "Lunas",
        receivedBy: "Ibu Maya",
      },
  });

  const expenseAtk = await prisma.expense.create({
    data: {
        categoryNameSnapshot: "Operasional Sekolah",
        categoryId: expenseCategoryByCode.get("OPERASIONAL")?.id,
        title: "Pembelian ATK TU",
        amount: 325000,
        spentAt: new Date("2026-07-01"),
        vendor: "Toko Sinar Jaya",
        note: "Kertas, map, tinta",
        createdBy: "Ibu Maya",
      },
  });
  const expenseMeeting = await prisma.expense.create({
    data: {
        categoryNameSnapshot: "Kegiatan Siswa",
        categoryId: expenseCategoryByCode.get("KEGIATAN_SISWA")?.id,
        title: "Konsumsi rapat wali kelas",
        amount: 210000,
        spentAt: new Date("2026-07-03"),
        vendor: "Kantin Sekolah",
        createdBy: "Ibu Maya",
      },
  });

  const [cashAccount, , revenueAccount, , expenseAccount] = accounts;
  const automaticEntries = [
    {
      type: "MASUK" as const,
      date: paymentAlya.paidAt,
      amount: paymentAlya.amount,
      description: "Pembayaran SPP Juli 2026 - Alya Putri",
      paymentId: paymentAlya.id,
      sourceType: "PAYMENT",
      sourceId: paymentAlya.id,
      debitId: cashAccount.id,
      creditId: revenueAccount.id,
      postedBy: "Ibu Maya",
    },
    {
      type: "MASUK" as const,
      date: paymentBima.paidAt,
      amount: paymentBima.amount,
      description: "Pembayaran SPP Juli 2026 - Bima Pratama",
      paymentId: paymentBima.id,
      sourceType: "PAYMENT",
      sourceId: paymentBima.id,
      debitId: cashAccount.id,
      creditId: revenueAccount.id,
      postedBy: "Ibu Maya",
    },
    {
      type: "KELUAR" as const,
      date: expenseAtk.spentAt,
      amount: expenseAtk.amount,
      description: "Pengeluaran Pembelian ATK TU",
      expenseId: expenseAtk.id,
      sourceType: "EXPENSE",
      sourceId: expenseAtk.id,
      debitId: expenseAccount.id,
      creditId: cashAccount.id,
      postedBy: "Ibu Maya",
    },
    {
      type: "KELUAR" as const,
      date: expenseMeeting.spentAt,
      amount: expenseMeeting.amount,
      description: "Pengeluaran Konsumsi rapat wali kelas",
      expenseId: expenseMeeting.id,
      sourceType: "EXPENSE",
      sourceId: expenseMeeting.id,
      debitId: expenseAccount.id,
      creditId: cashAccount.id,
      postedBy: "Ibu Maya",
    },
  ];

  for (const [index, entry] of automaticEntries.entries()) {
    await prisma.cashTransaction.create({
      data: {
        type: entry.type,
        date: entry.date,
        amount: entry.amount,
        description: entry.description,
        paymentId: entry.paymentId,
        expenseId: entry.expenseId,
        createdBy: entry.postedBy,
      },
    });
    await prisma.journalEntry.create({
      data: {
        number: `JU-202607-${String(index + 1).padStart(4, "0")}`,
        date: entry.date,
        description: entry.description,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        postedBy: entry.postedBy,
        lines: {
          create: [
            { accountId: entry.debitId, debit: entry.amount, credit: 0 },
            { accountId: entry.creditId, debit: 0, credit: entry.amount },
          ],
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
