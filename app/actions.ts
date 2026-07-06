"use server";

import {
  AccountType,
  CashType,
  InvoiceStatus,
  PaymentType,
  PermissionKey,
  Prisma,
  UserRole,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSession, createSession, getCurrentUser, requireUser } from "@/lib/auth";
import { assertBalanced, postExpenseAccounting, postPaymentAccounting, receiptNumber } from "@/lib/accounting";
import { hashPassword, verifyPassword } from "@/lib/password";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const classRoomSchema = z.object({
  name: z.string().min(2),
  level: z.string().min(1),
  homeroom: z.string().optional(),
});

const categorySchema = z.object({
  code: z.nativeEnum(PaymentType),
  name: z.string().min(3),
  defaultAmount: z.coerce.number().int().min(0),
  description: z.string().optional(),
  revenueAccountId: z.string().min(1),
});

const userSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.nativeEnum(UserRole),
});

const userUpdateSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  password: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(6).optional(),
  ),
  role: z.nativeEnum(UserRole),
});

const studentProfileSchema = z.object({
  nisn: z.string().min(4).max(20).regex(/^\d+$/, "NISN hanya boleh berisi angka."),
  name: z.string().min(3),
  gender: z.string().optional(),
  guardianName: z.string().min(3),
  phone: z.string().regex(/^\d*$/, "Nomor telepon hanya boleh berisi angka.").optional(),
});

const studentSchema = studentProfileSchema.extend({
  classRoomId: z.string().min(1),
  promotionStatus: z.string().optional(),
});

const invoiceSchema = z.object({
  studentId: z.string().min(1),
  paymentCategoryId: z.string().min(1),
  title: z.string().min(3),
  amount: z.coerce.number().int().positive(),
  dueDate: z.coerce.date(),
  academicYear: z.string().min(4),
  period: z.string().min(1),
  description: z.string().optional(),
});

const bulkInvoiceSchema = z.object({
  paymentCategoryId: z.string().min(1),
  classRoomId: z.string().min(1),
  title: z.string().min(3),
  amount: z.coerce.number().int().positive(),
  dueDate: z.coerce.date(),
  academicYear: z.string().min(4),
  period: z.string().min(1),
  description: z.string().optional(),
});

const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  assetAccountId: z.string().min(1),
  amount: z.coerce.number().int().positive(),
  paidAt: z.coerce.date(),
  method: z.string().min(3),
  note: z.string().optional(),
  receivedBy: z.string().min(3),
});

const expenseSchema = z.object({
  categoryId: z.string().min(1),
  assetAccountId: z.string().min(1),
  title: z.string().min(3),
  amount: z.coerce.number().int().positive(),
  spentAt: z.coerce.date(),
  vendor: z.string().optional(),
  note: z.string().optional(),
  createdBy: z.string().min(3),
});

const expenseCategorySchema = z.object({
  code: z.string().min(2).max(20).transform((value) => value.toUpperCase().replaceAll(" ", "_")),
  name: z.string().min(3),
  description: z.string().optional(),
  expenseAccountId: z.string().min(1),
});

const promotionSchema = z.object({
  sourceClassRoomId: z.string().min(1),
  targetClassRoomId: z.string().optional(),
  fromAcademicYear: z.string().min(4),
  toAcademicYear: z.string().min(4),
  movementType: z.enum(["PROMOSI", "LULUS"]),
  decisionStatus: z.string().optional(),
  note: z.string().optional(),
});

const cashSchema = z.object({
  type: z.nativeEnum(CashType),
  assetAccountId: z.string().min(1),
  contraAccountId: z.string().optional(),
  date: z.coerce.date(),
  amount: z.coerce.number().int().positive(),
  description: z.string().min(3),
  reference: z.string().optional(),
});

const accountSchema = z.object({
  code: z.string().min(3),
  name: z.string().min(3),
  type: z.nativeEnum(AccountType),
});

const paymentUpdateSchema = z.object({
  amount: z.coerce.number().int().positive(),
  assetAccountId: z.string().min(1),
  paidAt: z.coerce.date(),
  method: z.string().min(3),
  note: z.string().optional(),
});

const manualJournalSchema = z.object({
  amount: z.coerce.number().int().positive(),
  creditAccountId: z.string().min(1),
  date: z.coerce.date(),
  debitAccountId: z.string().min(1),
  description: z.string().min(3),
});

const receiptSettingSchema = z.object({
  schoolName: z.string().min(3),
  schoolAddress: z.string().min(3),
  schoolPhone: z.string().optional(),
  headerText: z.string().optional(),
  footerText: z.string().optional(),
  logoUrl: z.string().optional(),
  signatureName: z.string().optional(),
  signatureTitle: z.string().optional(),
});

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWithNotice(path: string, message: string, type: "success" | "error" = "success"): never {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("notice", message);
  params.set("noticeType", type);
  redirect(`${pathname}?${params.toString()}`);
}

function studentReturnPath(formData: FormData, overrides?: { classId?: string }) {
  const returnTo = getText(formData, "returnTo");
  if (!returnTo.startsWith("/master/siswa")) {
    if (overrides?.classId) {
      return `/master/siswa?view=active&classId=${encodeURIComponent(overrides.classId)}`;
    }
    return "/master/siswa";
  }

  const [pathname, query = ""] = returnTo.split("?");
  const params = new URLSearchParams(query);

  if (overrides?.classId) {
    params.set("classId", overrides.classId);
    if (!params.get("view")) params.set("view", "active");
  }

  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function firstZodMessage(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "Data belum valid. Periksa kembali input yang diisi.";

  const field = issue.path[0];
  if (field === "nisn") return issue.message.includes("angka")
    ? "NISN hanya boleh berisi angka."
    : "NISN harus terdiri dari 4 sampai 20 angka.";
  if (field === "name") return "Nama siswa minimal 3 karakter.";
  if (field === "guardianName") return "Nama wali murid minimal 3 karakter.";
  if (field === "classRoomId") return "Kelas wajib dipilih.";
  if (field === "phone") return "Nomor telepon hanya boleh berisi angka.";

  return issue.message || "Data belum valid. Periksa kembali input yang diisi.";
}

function validationMessage(error: z.ZodError) {
  const issue = error.issues[0];
  const fieldLabels: Record<string, string> = {
    accountId: "Akun",
    amount: "Nominal",
    assetAccountId: "Kas / bank",
    categoryId: "Kategori",
    classRoomId: "Kelas",
    code: "Kode",
    creditAccountId: "Akun kredit",
    date: "Tanggal",
    debitAccountId: "Akun debit",
    description: "Keterangan",
    dueDate: "Tanggal jatuh tempo",
    email: "Email",
    expenseAccountId: "Akun beban",
    fromAcademicYear: "Tahun ajaran asal",
    guardianName: "Nama wali murid",
    invoiceId: "Tagihan",
    name: "Nama",
    password: "Password",
    paymentCategoryId: "Jenis pembayaran",
    phone: "Nomor telepon",
    revenueAccountId: "Akun pendapatan",
    sourceClassRoomId: "Kelas asal",
    spentAt: "Tanggal pengeluaran",
    targetClassRoomId: "Kelas tujuan",
    title: "Judul",
    toAcademicYear: "Tahun ajaran tujuan",
  };
  const field = String(issue?.path[0] ?? "");
  const label = fieldLabels[field] ?? "Data";
  return `${label} belum valid. Periksa kembali input yang diisi.`;
}

function parseWithNotice<T extends z.ZodType>(
  schema: T,
  value: unknown,
  path: string,
): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    redirectWithNotice(path, validationMessage(parsed.error), "error");
  }
  return parsed.data;
}

async function assertPermission(permission: PermissionKey) {
  const user = await requireUser();
  if (!(await hasPermission(user.role, permission))) {
    throw new Error("Anda tidak memiliki hak akses untuk tindakan ini.");
  }
  return user;
}

async function assertActiveAccount(
  accountId: string,
  path: string,
  expectedType?: AccountType,
) {
  const account = await prisma.account.findFirst({
    where: {
      id: accountId,
      active: true,
      deletedAt: null,
      ...(expectedType ? { type: expectedType } : {}),
    },
    select: { id: true },
  });
  if (!account) {
    redirectWithNotice(path, "Akun yang dipilih tidak tersedia atau tidak sesuai jenisnya.", "error");
  }
}

async function recalculateInvoiceStatus(
  tx: Prisma.TransactionClient,
  invoiceId: string,
) {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { payments: { where: { deletedAt: null }, select: { amount: true } } },
  });
  const paid = invoice.payments.reduce((total, payment) => total + payment.amount, 0);
  const status = paid >= invoice.amount
    ? InvoiceStatus.LUNAS
    : paid > 0
      ? InvoiceStatus.CICILAN
      : InvoiceStatus.BELUM_BAYAR;
  await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: getText(formData, "email"),
    password: getText(formData, "password"),
  });
  if (!parsed.success) {
    redirect("/login?error=1");
  }

  const user = await prisma.user.findFirst({
    where: { email: parsed.data.email, active: true, deletedAt: null },
  });

  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    redirect("/login?error=1");
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function createClassRoom(formData: FormData) {
  await assertPermission(PermissionKey.MASTER_CLASS);
  const parsed = parseWithNotice(classRoomSchema, {
    name: getText(formData, "name"),
    level: getText(formData, "level"),
    homeroom: getText(formData, "homeroom"),
  }, "/master/kelas");

  const existing = await prisma.classRoom.findUnique({ where: { name: parsed.name } });
  if (existing && !existing.deletedAt) {
    redirectWithNotice("/master/kelas", "Nama kelas sudah digunakan.", "error");
  }
  if (existing) {
    await prisma.classRoom.update({
      where: { id: existing.id },
      data: { ...parsed, active: true, deletedAt: null },
    });
  } else {
    await prisma.classRoom.create({ data: parsed });
  }

  revalidatePath("/master/kelas");
  revalidatePath("/master/siswa");
  redirectWithNotice("/master/kelas", "Data kelas berhasil disimpan.");
}

export async function createPaymentCategory(formData: FormData) {
  await assertPermission(PermissionKey.MASTER_PAYMENT);
  const parsed = parseWithNotice(categorySchema, {
    code: getText(formData, "code"),
    name: getText(formData, "name"),
    defaultAmount: getText(formData, "defaultAmount"),
    description: getText(formData, "description"),
    revenueAccountId: getText(formData, "revenueAccountId"),
  }, "/master/jenis-pembayaran");
  await assertActiveAccount(
    parsed.revenueAccountId,
    "/master/jenis-pembayaran",
    AccountType.PENDAPATAN,
  );

  const existing = await prisma.paymentCategory.findUnique({ where: { code: parsed.code } });
  if (existing && !existing.deletedAt) {
    redirectWithNotice(
      "/master/jenis-pembayaran",
      "Kode jenis pembayaran sudah digunakan.",
      "error",
    );
  }
  const data = {
    ...parsed,
    revenueAccountId: parsed.revenueAccountId,
    active: true,
    deletedAt: null,
  };
  if (existing) {
    await prisma.paymentCategory.update({ where: { id: existing.id }, data });
  } else {
    await prisma.paymentCategory.create({ data });
  }

  revalidatePath("/master/jenis-pembayaran");
  revalidatePath("/transaksi/tagihan");
  redirectWithNotice("/master/jenis-pembayaran", "Jenis pembayaran berhasil disimpan.");
}

export async function createUser(formData: FormData) {
  await assertPermission(PermissionKey.USER_MANAGE);

  const parsed = parseWithNotice(userSchema, {
    name: getText(formData, "name"),
    email: getText(formData, "email"),
    password: getText(formData, "password"),
    role: getText(formData, "role"),
  }, "/master/pengguna");

  const existing = await prisma.user.findUnique({ where: { email: parsed.email } });
  if (existing && !existing.deletedAt) {
    redirectWithNotice("/master/pengguna", "Email sudah digunakan oleh pengguna lain.", "error");
  }
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: parsed.name,
        role: parsed.role,
        passwordHash: hashPassword(parsed.password),
        active: true,
        deletedAt: null,
      },
    });
  } else {
    await prisma.user.create({
      data: {
        name: parsed.name,
        email: parsed.email,
        passwordHash: hashPassword(parsed.password),
        role: parsed.role,
      },
    });
  }

  revalidatePath("/master/pengguna");
  redirectWithNotice("/master/pengguna", "Data pengguna berhasil disimpan.");
}

export async function createStudent(formData: FormData) {
  await assertPermission(PermissionKey.MASTER_STUDENT);
  const parsed = studentSchema.safeParse({
    nisn: getText(formData, "nisn"),
    name: getText(formData, "name"),
    classRoomId: getText(formData, "classRoomId"),
    gender: getText(formData, "gender"),
    promotionStatus: getText(formData, "promotionStatus"),
    guardianName: getText(formData, "guardianName"),
    phone: getText(formData, "phone"),
  });
  const returnPath = studentReturnPath(formData, {
    classId: parsed.success ? parsed.data.classRoomId : getText(formData, "classRoomId"),
  });

  if (!parsed.success) {
    redirectWithNotice(returnPath, firstZodMessage(parsed.error), "error");
  }

  const classRoom = await prisma.classRoom.findUniqueOrThrow({
    where: { id: parsed.data.classRoomId },
  });

  const existing = await prisma.student.findUnique({
    where: { nisn: parsed.data.nisn },
  });

  if (existing && !existing.deletedAt) {
    redirectWithNotice(returnPath, "NISN sudah terdaftar. Gunakan NISN lain.", "error");
  }

  if (existing?.deletedAt) {
    await prisma.student.update({
      where: { id: existing.id },
      data: {
        ...parsed.data,
        promotionStatus: parsed.data.promotionStatus || "BELUM_DITENTUKAN",
        classNameSnapshot: classRoom.name,
        active: true,
        deletedAt: null,
      },
    });
  } else {
    await prisma.student.create({
      data: {
        ...parsed.data,
        promotionStatus: parsed.data.promotionStatus || "BELUM_DITENTUKAN",
        classNameSnapshot: classRoom.name,
        deletedAt: null,
      },
    });
  }

  revalidatePath("/master/siswa");
  revalidatePath("/dashboard");
  redirectWithNotice(returnPath, "Data siswa berhasil disimpan.");
}

export async function createInvoice(formData: FormData) {
  await assertPermission(PermissionKey.INVOICE_MANAGE);
  const parsed = parseWithNotice(invoiceSchema, {
    studentId: getText(formData, "studentId"),
    paymentCategoryId: getText(formData, "paymentCategoryId"),
    title: getText(formData, "title"),
    amount: getText(formData, "amount"),
    dueDate: getText(formData, "dueDate"),
    academicYear: getText(formData, "academicYear"),
    period: getText(formData, "period"),
    description: getText(formData, "description"),
  }, "/transaksi/tagihan");
  const category = await prisma.paymentCategory.findUniqueOrThrow({
    where: { id: parsed.paymentCategoryId },
  });
  const duplicate = await prisma.invoice.findFirst({
    where: {
      academicYear: parsed.academicYear,
      deletedAt: null,
      paymentCategoryId: parsed.paymentCategoryId,
      period: parsed.period,
      studentId: parsed.studentId,
    },
    select: { id: true },
  });
  if (duplicate) {
    redirectWithNotice(
      "/transaksi/tagihan",
      "Siswa sudah memiliki tagihan jenis dan periode yang sama.",
      "error",
    );
  }

  await prisma.invoice.create({
    data: {
      ...parsed,
      type: category.code,
      status: InvoiceStatus.BELUM_BAYAR,
    },
  });

  revalidatePath("/transaksi/tagihan");
  revalidatePath("/dashboard");
  revalidatePath("/laporan");
  redirectWithNotice("/transaksi/tagihan", "Tagihan berhasil dibuat.");
}

export async function createBulkInvoices(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.INVOICE_MANAGE);
  const parsed = parseWithNotice(bulkInvoiceSchema, {
    paymentCategoryId: getText(formData, "paymentCategoryId"),
    classRoomId: getText(formData, "classRoomId"),
    title: getText(formData, "title"),
    amount: getText(formData, "amount"),
    dueDate: getText(formData, "dueDate"),
    academicYear: getText(formData, "academicYear"),
    period: getText(formData, "period"),
    description: getText(formData, "description"),
  }, "/transaksi/tagihan");
  const allClasses = parsed.classRoomId === "ALL";
  const [category, classRoom, students] = await Promise.all([
    prisma.paymentCategory.findUniqueOrThrow({ where: { id: parsed.paymentCategoryId } }),
    allClasses
      ? Promise.resolve(null)
      : prisma.classRoom.findUniqueOrThrow({ where: { id: parsed.classRoomId } }),
    prisma.student.findMany({
      where: {
        active: true,
        deletedAt: null,
        ...(allClasses ? {} : { classRoomId: parsed.classRoomId }),
      },
      select: { id: true },
    }),
  ]);

  if (!students.length) {
    redirectWithNotice("/transaksi/tagihan", "Tidak ada siswa aktif pada sasaran tagihan.", "error");
  }

  const existing = await prisma.invoice.findMany({
    where: {
      studentId: { in: students.map((student) => student.id) },
      deletedAt: null,
      paymentCategoryId: parsed.paymentCategoryId,
      academicYear: parsed.academicYear,
      period: parsed.period,
    },
    select: { studentId: true },
  });
  const alreadyBilled = new Set(existing.map((invoice) => invoice.studentId));
  const targetStudents = students.filter((student) => !alreadyBilled.has(student.id));

  if (!targetStudents.length) {
    redirectWithNotice(
      "/transaksi/tagihan",
      "Semua siswa pada sasaran ini sudah memiliki tagihan untuk periode yang sama.",
      "error",
    );
  }

  await prisma.$transaction(async (tx) => {
    const batch = await tx.billingBatch.create({
      data: {
        title: parsed.title,
        paymentCategoryId: category.id,
        classRoomId: allClasses ? null : parsed.classRoomId,
        targetLabelSnapshot: allClasses ? "Semua Kelas" : classRoom?.name ?? "Kelas",
        amount: parsed.amount,
        dueDate: parsed.dueDate,
        academicYear: parsed.academicYear,
        period: parsed.period,
        description: parsed.description,
        createdBy: currentUser.name,
      },
    });
    await tx.invoice.createMany({
      data: targetStudents.map((student) => ({
        studentId: student.id,
        paymentCategoryId: category.id,
        billingBatchId: batch.id,
        type: category.code,
        title: parsed.title,
        amount: parsed.amount,
        dueDate: parsed.dueDate,
        academicYear: parsed.academicYear,
        period: parsed.period,
        status: InvoiceStatus.BELUM_BAYAR,
        description: parsed.description,
      })),
    });
  });

  revalidatePath("/transaksi/tagihan");
  revalidatePath("/master/siswa");
  revalidatePath("/dashboard");
  revalidatePath("/laporan");
  redirectWithNotice(
    "/transaksi/tagihan",
    `${targetStudents.length} tagihan berhasil dibuat sekaligus${alreadyBilled.size ? `, ${alreadyBilled.size} duplikat dilewati` : ""}.`,
  );
}

export async function recordPayment(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.PAYMENT_MANAGE);
  const parsed = parseWithNotice(paymentSchema, {
    invoiceId: getText(formData, "invoiceId"),
    assetAccountId: getText(formData, "assetAccountId"),
    amount: getText(formData, "amount"),
    paidAt: getText(formData, "paidAt"),
    method: getText(formData, "method"),
    note: getText(formData, "note"),
    receivedBy: getText(formData, "receivedBy"),
  }, "/transaksi/pembayaran");
  await assertActiveAccount(
    parsed.assetAccountId,
    "/transaksi/pembayaran",
    AccountType.ASET,
  );

  const invoiceBeforePayment = await prisma.invoice.findUnique({
    where: { id: parsed.invoiceId },
    include: { student: true, payments: { where: { deletedAt: null }, select: { amount: true } } },
  });

  if (!invoiceBeforePayment) {
    redirectWithNotice("/transaksi/pembayaran", "Tagihan tidak ditemukan.", "error");
  }

  const paidBefore = invoiceBeforePayment.payments.reduce((total, payment) => total + payment.amount, 0);
  const remainingBefore = Math.max(invoiceBeforePayment.amount - paidBefore, 0);

  if (parsed.amount > remainingBefore) {
    redirectWithNotice(
      "/transaksi/pembayaran",
      "Nominal pembayaran melebihi sisa tagihan.",
      "error",
    );
  }

  const { assetAccountId, ...paymentData } = parsed;
  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        ...paymentData,
        receiptNo: receiptNumber(),
        receivedBy: currentUser.name,
      },
    });

    await recalculateInvoiceStatus(tx, parsed.invoiceId);
    await postPaymentAccounting(tx, {
      paymentId: created.id,
      invoiceId: parsed.invoiceId,
      assetAccountId,
      amount: created.amount,
      date: created.paidAt,
      description: `Pembayaran ${invoiceBeforePayment.title} - ${invoiceBeforePayment.student.name}`,
      createdBy: currentUser.name,
    });
    return created;
  });

  revalidatePath("/transaksi/pembayaran");
  revalidatePath("/transaksi/tagihan");
  revalidatePath("/dashboard");
  revalidatePath("/laporan");
  revalidatePath("/buku-kas");
  revalidatePath("/akuntansi");
  redirect(`/kwitansi/${payment.id}?new=1`);
}

export async function createExpense(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.EXPENSE_MANAGE);
  const parsed = parseWithNotice(expenseSchema, {
    categoryId: getText(formData, "categoryId"),
    assetAccountId: getText(formData, "assetAccountId"),
    title: getText(formData, "title"),
    amount: getText(formData, "amount"),
    spentAt: getText(formData, "spentAt"),
    vendor: getText(formData, "vendor"),
    note: getText(formData, "note"),
    createdBy: getText(formData, "createdBy"),
  }, "/transaksi/pengeluaran");
  await assertActiveAccount(
    parsed.assetAccountId,
    "/transaksi/pengeluaran",
    AccountType.ASET,
  );
  const category = await prisma.expenseCategory.findUniqueOrThrow({
    where: { id: parsed.categoryId },
  });
  const {
    assetAccountId,
    categoryId,
    title,
    amount,
    spentAt,
    vendor,
    note,
  } = parsed;
  const expenseData = { categoryId, title, amount, spentAt, vendor, note };

  await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        ...expenseData,
        categoryNameSnapshot: category.name,
        createdBy: currentUser.name,
      },
    });
    await postExpenseAccounting(tx, {
      expenseId: expense.id,
      assetAccountId,
      amount: expense.amount,
      date: expense.spentAt,
      description: `Pengeluaran ${expense.title}`,
      createdBy: currentUser.name,
      expenseAccountId: category.expenseAccountId,
    });
  });

  revalidatePath("/transaksi/pengeluaran");
  revalidatePath("/dashboard");
  revalidatePath("/laporan");
  revalidatePath("/buku-kas");
  revalidatePath("/akuntansi");
  redirectWithNotice("/transaksi/pengeluaran", "Pengeluaran berhasil disimpan.");
}

export async function ensureAuthenticated() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
}

export async function updateClassRoom(formData: FormData) {
  await assertPermission(PermissionKey.MASTER_CLASS);
  const id = getText(formData, "id");
  const parsed = parseWithNotice(classRoomSchema, {
    name: getText(formData, "name"),
    level: getText(formData, "level"),
    homeroom: getText(formData, "homeroom"),
  }, "/master/kelas");
  const duplicate = await prisma.classRoom.findFirst({
    where: { name: parsed.name, deletedAt: null, NOT: { id } },
  });
  if (duplicate) {
    redirectWithNotice("/master/kelas", "Nama kelas sudah digunakan.", "error");
  }
  await prisma.$transaction(async (tx) => {
    await tx.classRoom.update({ where: { id }, data: parsed });
    await tx.student.updateMany({ where: { classRoomId: id }, data: { classNameSnapshot: parsed.name } });
  });
  redirectWithNotice("/master/kelas", "Data kelas berhasil diubah.");
}

export async function deleteClassRoom(formData: FormData) {
  await assertPermission(PermissionKey.MASTER_CLASS);
  const id = getText(formData, "id");
  const students = await prisma.student.count({ where: { classRoomId: id, deletedAt: null } });
  if (students) redirectWithNotice("/master/kelas", "Kelas masih memiliki siswa dan tidak dapat dihapus.", "error");
  await prisma.classRoom.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
  redirectWithNotice("/master/kelas", "Data kelas berhasil dihapus.");
}

export async function promoteClassStudents(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.MASTER_CLASS);
  const parsed = parseWithNotice(promotionSchema, {
    sourceClassRoomId: getText(formData, "sourceClassRoomId"),
    targetClassRoomId: getText(formData, "targetClassRoomId"),
    fromAcademicYear: getText(formData, "fromAcademicYear"),
    toAcademicYear: getText(formData, "toAcademicYear"),
    movementType: getText(formData, "movementType"),
    decisionStatus: getText(formData, "decisionStatus"),
    note: getText(formData, "note"),
  }, "/master/kenaikan-kelas");

  if (parsed.movementType === "PROMOSI" && !parsed.targetClassRoomId) {
    redirectWithNotice("/master/kenaikan-kelas", "Pilih kelas tujuan untuk proses kenaikan kelas.", "error");
  }
  if (parsed.sourceClassRoomId === parsed.targetClassRoomId) {
    redirectWithNotice("/master/kenaikan-kelas", "Kelas asal dan kelas tujuan tidak boleh sama.", "error");
  }

  const [source, target, students] = await Promise.all([
    prisma.classRoom.findUniqueOrThrow({ where: { id: parsed.sourceClassRoomId } }),
    parsed.targetClassRoomId
      ? prisma.classRoom.findUniqueOrThrow({ where: { id: parsed.targetClassRoomId } })
      : Promise.resolve(null),
    prisma.student.findMany({
      where: { id: { in: formData.getAll("studentIds").filter((value): value is string => typeof value === "string") }, classRoomId: parsed.sourceClassRoomId, active: true, deletedAt: null },
      select: { id: true },
    }),
  ]);

  if (!students.length) {
    redirectWithNotice("/master/kenaikan-kelas", "Pilih minimal satu siswa aktif untuk diproses.", "error");
  }

  await prisma.$transaction(async (tx) => {
    await tx.studentClassHistory.createMany({
      data: students.map((student) => ({
        studentId: student.id,
        fromClassRoomId: source.id,
        fromClassNameSnapshot: source.name,
        fromAcademicYear: parsed.fromAcademicYear,
        toClassRoomId: target?.id,
        toClassNameSnapshot: target?.name ?? "Lulus",
        toAcademicYear: parsed.toAcademicYear,
        academicYear: parsed.toAcademicYear,
        movementType: parsed.movementType,
        decisionStatus: parsed.decisionStatus || (parsed.movementType === "LULUS" ? "LULUS" : "NAIK"),
        note: parsed.note,
        movedBy: currentUser.name,
      })),
    });
    await tx.student.updateMany({
      where: { id: { in: students.map((student) => student.id) } },
      data: parsed.movementType === "LULUS"
        ? { active: false, classRoomId: null, classNameSnapshot: "LULUS", promotionStatus: "LULUS" }
        : { classRoomId: target!.id, classNameSnapshot: target!.name, promotionStatus: parsed.decisionStatus || "NAIK" },
    });
  });

  revalidatePath("/master/kelas");
  revalidatePath("/master/siswa");
  revalidatePath("/transaksi/tagihan");
  revalidatePath("/transaksi/pembayaran");
  redirectWithNotice(
    "/master/kenaikan-kelas",
    `${students.length} siswa berhasil ${parsed.movementType === "LULUS" ? "diluluskan" : `dipindahkan ke ${target?.name}`}.`,
  );
}

export async function updatePaymentCategory(formData: FormData) {
  await assertPermission(PermissionKey.MASTER_PAYMENT);
  const id = getText(formData, "id");
  const parsed = parseWithNotice(categorySchema, {
    code: getText(formData, "code"),
    name: getText(formData, "name"),
    defaultAmount: getText(formData, "defaultAmount"),
    description: getText(formData, "description"),
    revenueAccountId: getText(formData, "revenueAccountId"),
  }, "/master/jenis-pembayaran");
  await assertActiveAccount(
    parsed.revenueAccountId,
    "/master/jenis-pembayaran",
    AccountType.PENDAPATAN,
  );
  await prisma.paymentCategory.update({
    where: { id },
    data: { ...parsed, revenueAccountId: parsed.revenueAccountId || null },
  });
  redirectWithNotice("/master/jenis-pembayaran", "Jenis pembayaran berhasil diubah.");
}

export async function deletePaymentCategory(formData: FormData) {
  await assertPermission(PermissionKey.MASTER_PAYMENT);
  await prisma.paymentCategory.update({ where: { id: getText(formData, "id") }, data: { active: false, deletedAt: new Date() } });
  redirectWithNotice("/master/jenis-pembayaran", "Jenis pembayaran berhasil dihapus.");
}

export async function createExpenseCategory(formData: FormData) {
  await assertPermission(PermissionKey.MASTER_EXPENSE_CATEGORY);
  const parsed = parseWithNotice(expenseCategorySchema, {
    code: getText(formData, "code"),
    name: getText(formData, "name"),
    description: getText(formData, "description"),
    expenseAccountId: getText(formData, "expenseAccountId"),
  }, "/master/kategori-pengeluaran");
  await assertActiveAccount(
    parsed.expenseAccountId,
    "/master/kategori-pengeluaran",
    AccountType.BEBAN,
  );
  const existing = await prisma.expenseCategory.findFirst({
    where: {
      OR: [{ code: parsed.code }, { name: parsed.name }],
    },
  });
  if (existing && !existing.deletedAt) {
    redirectWithNotice(
      "/master/kategori-pengeluaran",
      "Kode atau nama kategori sudah digunakan.",
      "error",
    );
  }
  const data = {
    ...parsed,
    expenseAccountId: parsed.expenseAccountId || null,
    deletedAt: null,
    active: true,
  };
  if (existing) {
    await prisma.expenseCategory.update({ where: { id: existing.id }, data });
  } else {
    await prisma.expenseCategory.create({ data });
  }
  revalidatePath("/master/kategori-pengeluaran");
  revalidatePath("/transaksi/pengeluaran");
  redirectWithNotice("/master/kategori-pengeluaran", "Kategori pengeluaran berhasil ditambahkan.");
}

export async function updateExpenseCategory(formData: FormData) {
  await assertPermission(PermissionKey.MASTER_EXPENSE_CATEGORY);
  const parsed = parseWithNotice(expenseCategorySchema, {
    code: getText(formData, "code"),
    name: getText(formData, "name"),
    description: getText(formData, "description"),
    expenseAccountId: getText(formData, "expenseAccountId"),
  }, "/master/kategori-pengeluaran");
  await assertActiveAccount(
    parsed.expenseAccountId,
    "/master/kategori-pengeluaran",
    AccountType.BEBAN,
  );
  const id = getText(formData, "id");
  const duplicate = await prisma.expenseCategory.findFirst({
    where: {
      deletedAt: null,
      NOT: { id },
      OR: [{ code: parsed.code }, { name: parsed.name }],
    },
  });
  if (duplicate) {
    redirectWithNotice(
      "/master/kategori-pengeluaran",
      "Kode atau nama kategori sudah digunakan.",
      "error",
    );
  }
  await prisma.expenseCategory.update({
    where: { id },
    data: {
      ...parsed,
      expenseAccountId: parsed.expenseAccountId || null,
      active: getText(formData, "active") === "true",
    },
  });
  revalidatePath("/master/kategori-pengeluaran");
  revalidatePath("/transaksi/pengeluaran");
  redirectWithNotice("/master/kategori-pengeluaran", "Kategori pengeluaran berhasil diubah.");
}

export async function deleteExpenseCategory(formData: FormData) {
  await assertPermission(PermissionKey.MASTER_EXPENSE_CATEGORY);
  const id = getText(formData, "id");
  const used = await prisma.expense.count({ where: { categoryId: id, deletedAt: null } });
  if (used) {
    redirectWithNotice(
      "/master/kategori-pengeluaran",
      "Kategori sudah dipakai pada transaksi. Nonaktifkan kategori sebagai gantinya.",
      "error",
    );
  }
  await prisma.expenseCategory.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
  redirectWithNotice("/master/kategori-pengeluaran", "Kategori pengeluaran berhasil dihapus.");
}

export async function updateUser(formData: FormData) {
  await assertPermission(PermissionKey.USER_MANAGE);
  const id = getText(formData, "id");
  const parsed = parseWithNotice(userUpdateSchema, {
    name: getText(formData, "name"),
    email: getText(formData, "email"),
    password: getText(formData, "password"),
    role: getText(formData, "role"),
  }, "/master/pengguna");
  const data = {
    name: parsed.name,
    email: parsed.email,
    role: parsed.role,
    active: getText(formData, "active") === "true",
    ...(parsed.password ? { passwordHash: hashPassword(parsed.password) } : {}),
  };
  const duplicate = await prisma.user.findFirst({
    where: { email: data.email, deletedAt: null, NOT: { id } },
  });
  if (duplicate) {
    redirectWithNotice("/master/pengguna", "Email sudah digunakan oleh pengguna lain.", "error");
  }
  await prisma.user.update({ where: { id }, data });
  redirectWithNotice("/master/pengguna", "Pengguna berhasil diubah.");
}

export async function deleteUser(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.USER_MANAGE);
  const id = getText(formData, "id");
  if (id === currentUser.id) redirectWithNotice("/master/pengguna", "Akun yang sedang digunakan tidak dapat dihapus.", "error");
  await prisma.user.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
  redirectWithNotice("/master/pengguna", "Pengguna berhasil dihapus.");
}

export async function updateRolePermissions(formData: FormData) {
  await assertPermission(PermissionKey.ROLE_MANAGE);
  const role = parseWithNotice(
    z.nativeEnum(UserRole),
    getText(formData, "role"),
    "/master/pengguna",
  );
  const selected = new Set(formData.getAll("permissions").filter((value): value is string => typeof value === "string"));
  await prisma.$transaction(
    Object.values(PermissionKey).map((permission) =>
      prisma.rolePermission.upsert({
        where: { role_permission: { role, permission } },
        create: { role, permission, allowed: selected.has(permission) },
        update: { allowed: selected.has(permission) },
      }),
    ),
  );
  revalidatePath("/", "layout");
  redirectWithNotice("/master/pengguna", `Hak akses ${role.replaceAll("_", " ")} berhasil diperbarui.`);
}

export async function updateStudent(formData: FormData) {
  await assertPermission(PermissionKey.MASTER_STUDENT);
  const id = getText(formData, "id");
  const returnPath = studentReturnPath(formData);
  const parsed = studentProfileSchema.safeParse({
    nisn: getText(formData, "nisn"),
    name: getText(formData, "name"),
    gender: getText(formData, "gender"),
    guardianName: getText(formData, "guardianName"),
    phone: getText(formData, "phone"),
  });

  if (!parsed.success) {
    redirectWithNotice(returnPath, firstZodMessage(parsed.error), "error");
  }
  const duplicate = await prisma.student.findFirst({
    where: { nisn: parsed.data.nisn, deletedAt: null, NOT: { id } },
    select: { id: true },
  });
  if (duplicate) {
    redirectWithNotice(returnPath, "NISN sudah terdaftar. Gunakan NISN lain.", "error");
  }
  await prisma.student.update({
    where: { id },
    data: parsed.data,
  });
  revalidatePath("/master/siswa");
  redirectWithNotice(returnPath, "Data siswa berhasil diubah.");
}

export async function deleteStudent(formData: FormData) {
  await assertPermission(PermissionKey.MASTER_STUDENT);
  const id = getText(formData, "id");
  const returnPath = studentReturnPath(formData);
  await prisma.student.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
  revalidatePath("/master/siswa");
  redirectWithNotice(returnPath, "Data siswa berhasil dihapus.");
}

export async function updateInvoice(formData: FormData) {
  await assertPermission(PermissionKey.INVOICE_MANAGE);
  const id = getText(formData, "id");
  const parsed = parseWithNotice(invoiceSchema, {
    studentId: getText(formData, "studentId"),
    paymentCategoryId: getText(formData, "paymentCategoryId"),
    title: getText(formData, "title"),
    amount: getText(formData, "amount"),
    dueDate: getText(formData, "dueDate"),
    academicYear: getText(formData, "academicYear"),
    period: getText(formData, "period"),
    description: getText(formData, "description"),
  }, "/transaksi/tagihan");
  const category = await prisma.paymentCategory.findUniqueOrThrow({
    where: { id: parsed.paymentCategoryId },
  });
  const [currentInvoice, paid] = await Promise.all([
    prisma.invoice.findUniqueOrThrow({
      where: { id },
      select: { paymentCategoryId: true },
    }),
    prisma.payment.aggregate({ where: { invoiceId: id, deletedAt: null }, _sum: { amount: true } }),
  ]);
  if ((paid._sum.amount ?? 0) > parsed.amount) {
    redirectWithNotice("/transaksi/tagihan", "Nominal tagihan tidak boleh lebih kecil dari pembayaran yang sudah masuk.", "error");
  }
  if ((paid._sum.amount ?? 0) > 0 && currentInvoice.paymentCategoryId !== parsed.paymentCategoryId) {
    redirectWithNotice(
      "/transaksi/tagihan",
      "Jenis pembayaran tidak dapat diubah karena tagihan sudah memiliki pembayaran.",
      "error",
    );
  }
  const duplicate = await prisma.invoice.findFirst({
    where: {
      academicYear: parsed.academicYear,
      deletedAt: null,
      NOT: { id },
      paymentCategoryId: parsed.paymentCategoryId,
      period: parsed.period,
      studentId: parsed.studentId,
    },
    select: { id: true },
  });
  if (duplicate) {
    redirectWithNotice(
      "/transaksi/tagihan",
      "Siswa sudah memiliki tagihan jenis dan periode yang sama.",
      "error",
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { ...parsed, type: category.code } });
    await recalculateInvoiceStatus(tx, id);
  });
  redirectWithNotice("/transaksi/tagihan", "Tagihan berhasil diubah.");
}

export async function deleteInvoice(formData: FormData) {
  await assertPermission(PermissionKey.INVOICE_MANAGE);
  const id = getText(formData, "id");
  const payments = await prisma.payment.count({ where: { invoiceId: id, deletedAt: null } });
  if (payments) redirectWithNotice("/transaksi/tagihan", "Tagihan yang sudah memiliki pembayaran tidak dapat dihapus.", "error");
  await prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
  redirectWithNotice("/transaksi/tagihan", "Tagihan berhasil dihapus.");
}

export async function updatePayment(formData: FormData) {
  await assertPermission(PermissionKey.PAYMENT_MANAGE);
  const id = getText(formData, "id");
  const current = await prisma.payment.findUniqueOrThrow({ where: { id }, include: { invoice: true } });
  const parsed = parseWithNotice(paymentUpdateSchema, {
    amount: getText(formData, "amount"),
    assetAccountId: getText(formData, "assetAccountId"),
    paidAt: getText(formData, "paidAt"),
    method: getText(formData, "method"),
    note: getText(formData, "note"),
  }, "/transaksi/pembayaran");
  await assertActiveAccount(
    parsed.assetAccountId,
    "/transaksi/pembayaran",
    AccountType.ASET,
  );
  const { amount, assetAccountId, paidAt } = parsed;
  const paidOther = await prisma.payment.aggregate({
    where: { invoiceId: current.invoiceId, deletedAt: null, NOT: { id } },
    _sum: { amount: true },
  });
  if ((paidOther._sum.amount ?? 0) + amount > current.invoice.amount) {
    redirectWithNotice("/transaksi/pembayaran", "Nominal pembayaran melebihi sisa tagihan.", "error");
  }
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id },
      data: {
        amount,
        paidAt,
        method: parsed.method,
        note: parsed.note,
      },
    });
    const cashEntry = await tx.cashTransaction.findFirst({ where: { paymentId: id, deletedAt: null } });
    await tx.cashTransaction.updateMany({
      where: { paymentId: id },
      data: { amount, date: paidAt, assetAccountId },
    });
    const journal = await tx.journalEntry.findFirst({ where: { sourceType: "PAYMENT", sourceId: id } });
    if (journal) {
      await tx.journalLine.updateMany({
        where: { journalEntryId: journal.id, debit: { gt: 0 } },
        data: { debit: amount, accountId: assetAccountId },
      });
      await tx.journalLine.updateMany({
        where: { journalEntryId: journal.id, credit: { gt: 0 } },
        data: {
          credit: amount,
          ...(cashEntry?.contraAccountId ? { accountId: cashEntry.contraAccountId } : {}),
        },
      });
      await tx.journalEntry.update({ where: { id: journal.id }, data: { date: paidAt } });
    }
    await recalculateInvoiceStatus(tx, current.invoiceId);
  });
  redirectWithNotice("/transaksi/pembayaran", "Pembayaran berhasil diubah.");
}

export async function deletePayment(formData: FormData) {
  await assertPermission(PermissionKey.PAYMENT_MANAGE);
  const id = getText(formData, "id");
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.updateMany({ where: { sourceType: "PAYMENT", sourceId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.cashTransaction.updateMany({ where: { paymentId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.payment.update({ where: { id }, data: { deletedAt: new Date() } });
    await recalculateInvoiceStatus(tx, payment.invoiceId);
  });
  redirectWithNotice("/transaksi/pembayaran", "Pembayaran dan pencatatan kas terkait berhasil dihapus.");
}

export async function updateExpense(formData: FormData) {
  await assertPermission(PermissionKey.EXPENSE_MANAGE);
  const id = getText(formData, "id");
  const parsed = parseWithNotice(expenseSchema, {
    categoryId: getText(formData, "categoryId"),
    assetAccountId: getText(formData, "assetAccountId"),
    title: getText(formData, "title"),
    amount: getText(formData, "amount"),
    spentAt: getText(formData, "spentAt"),
    vendor: getText(formData, "vendor"),
    note: getText(formData, "note"),
    createdBy: getText(formData, "createdBy"),
  }, "/transaksi/pengeluaran");
  await assertActiveAccount(
    parsed.assetAccountId,
    "/transaksi/pengeluaran",
    AccountType.ASET,
  );
  const category = await prisma.expenseCategory.findUniqueOrThrow({
    where: { id: parsed.categoryId },
  });
  const {
    assetAccountId,
    categoryId,
    title,
    amount,
    spentAt,
    vendor,
    note,
  } = parsed;
  const expenseData = { categoryId, title, amount, spentAt, vendor, note };
  await prisma.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id },
      data: { ...expenseData, categoryNameSnapshot: category.name },
    });
    await tx.cashTransaction.updateMany({
      where: { expenseId: id },
      data: {
        amount: parsed.amount,
        date: parsed.spentAt,
        description: `Pengeluaran ${parsed.title}`,
        assetAccountId,
        contraAccountId: category.expenseAccountId || null,
      },
    });
    const journal = await tx.journalEntry.findFirst({ where: { sourceType: "EXPENSE", sourceId: id, deletedAt: null } });
    if (journal) {
      await tx.journalLine.updateMany({ where: { journalEntryId: journal.id, debit: { gt: 0 } }, data: { debit: parsed.amount } });
      await tx.journalLine.updateMany({
        where: { journalEntryId: journal.id, credit: { gt: 0 } },
        data: { credit: parsed.amount, accountId: assetAccountId },
      });
      if (category.expenseAccountId) {
        const debitLine = await tx.journalLine.findFirst({
          where: { journalEntryId: journal.id, debit: { gt: 0 } },
        });
        if (debitLine) {
          await tx.journalLine.update({
            where: { id: debitLine.id },
            data: { accountId: category.expenseAccountId },
          });
        }
      }
      await tx.journalEntry.update({ where: { id: journal.id }, data: { date: parsed.spentAt } });
    }
  });
  redirectWithNotice("/transaksi/pengeluaran", "Pengeluaran berhasil diubah.");
}

export async function deleteExpense(formData: FormData) {
  await assertPermission(PermissionKey.EXPENSE_MANAGE);
  const id = getText(formData, "id");
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.updateMany({ where: { sourceType: "EXPENSE", sourceId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.cashTransaction.updateMany({ where: { expenseId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  });
  redirectWithNotice("/transaksi/pengeluaran", "Pengeluaran dan pencatatan kas terkait berhasil dihapus.");
}

export async function createCashTransaction(formData: FormData) {
  const user = await assertPermission(PermissionKey.CASHBOOK_MANAGE);
  const parsed = parseWithNotice(cashSchema, {
    type: getText(formData, "type"),
    assetAccountId: getText(formData, "assetAccountId"),
    contraAccountId: getText(formData, "contraAccountId"),
    date: getText(formData, "date"),
    amount: getText(formData, "amount"),
    description: getText(formData, "description"),
    reference: getText(formData, "reference"),
  }, "/buku-kas");
  await assertActiveAccount(parsed.assetAccountId, "/buku-kas", AccountType.ASET);
  const contraAccountId = parsed.contraAccountId || getText(formData, "accountId");
  if (!contraAccountId) {
    redirectWithNotice("/buku-kas", "Akun lawan wajib dipilih.", "error");
  }
  await assertActiveAccount(contraAccountId, "/buku-kas");
  await prisma.$transaction(async (tx) => {
    const cash = await tx.cashTransaction.create({
      data: { ...parsed, contraAccountId, createdBy: user.name },
    });
    const cashAccount = await tx.account.findUniqueOrThrow({ where: { id: parsed.assetAccountId } });
    const lines = parsed.type === CashType.MASUK
      ? [
          { accountId: cashAccount.id, debit: parsed.amount, credit: 0 },
          { accountId: contraAccountId, debit: 0, credit: parsed.amount },
        ]
      : [
          { accountId: contraAccountId, debit: parsed.amount, credit: 0 },
          { accountId: cashAccount.id, debit: 0, credit: parsed.amount },
        ];
    await tx.journalEntry.create({
      data: {
        number: `JU-${Date.now()}`,
        date: parsed.date,
        description: parsed.description,
        sourceType: "CASH",
        sourceId: cash.id,
        postedBy: user.name,
        lines: { create: lines },
      },
    });
  });
  redirectWithNotice("/buku-kas", "Transaksi kas dan jurnal berhasil disimpan.");
}

export async function updateCashTransaction(formData: FormData) {
  await assertPermission(PermissionKey.CASHBOOK_MANAGE);
  const id = getText(formData, "id");
  const parsed = parseWithNotice(cashSchema, {
    type: getText(formData, "type"),
    assetAccountId: getText(formData, "assetAccountId"),
    contraAccountId: getText(formData, "contraAccountId"),
    date: getText(formData, "date"),
    amount: getText(formData, "amount"),
    description: getText(formData, "description"),
    reference: getText(formData, "reference"),
  }, "/buku-kas");
  await assertActiveAccount(parsed.assetAccountId, "/buku-kas", AccountType.ASET);
  const current = await prisma.cashTransaction.findUniqueOrThrow({ where: { id } });
  if (current.paymentId || current.expenseId) {
    redirectWithNotice("/buku-kas", "Transaksi otomatis harus diubah dari menu sumbernya.", "error");
  }
  const selectedContraAccountId = parsed.contraAccountId || current.contraAccountId;
  if (!selectedContraAccountId) {
    redirectWithNotice("/buku-kas", "Akun lawan wajib dipilih.", "error");
  }
  await assertActiveAccount(selectedContraAccountId, "/buku-kas");
  await prisma.$transaction(async (tx) => {
    const contraAccountId = selectedContraAccountId;
    await tx.cashTransaction.update({
      where: { id },
      data: { ...parsed, contraAccountId },
    });
    const journal = await tx.journalEntry.findFirst({ where: { sourceType: "CASH", sourceId: id, deletedAt: null } });
    if (journal) {
      const debitLine = await tx.journalLine.findFirst({ where: { journalEntryId: journal.id, debit: { gt: 0 } } });
      const creditLine = await tx.journalLine.findFirst({ where: { journalEntryId: journal.id, credit: { gt: 0 } } });
      if (parsed.type === CashType.MASUK) {
        if (debitLine) {
          await tx.journalLine.update({
            where: { id: debitLine.id },
            data: { debit: parsed.amount, accountId: parsed.assetAccountId },
          });
        }
        if (creditLine && contraAccountId) {
          await tx.journalLine.update({
            where: { id: creditLine.id },
            data: { credit: parsed.amount, accountId: contraAccountId },
          });
        }
      } else {
        if (debitLine && contraAccountId) {
          await tx.journalLine.update({
            where: { id: debitLine.id },
            data: { debit: parsed.amount, accountId: contraAccountId },
          });
        }
        if (creditLine) {
          await tx.journalLine.update({
            where: { id: creditLine.id },
            data: { credit: parsed.amount, accountId: parsed.assetAccountId },
          });
        }
      }
      await tx.journalEntry.update({ where: { id: journal.id }, data: { date: parsed.date, description: parsed.description } });
    }
  });
  redirectWithNotice("/buku-kas", "Transaksi kas berhasil diubah.");
}

export async function deleteCashTransaction(formData: FormData) {
  await assertPermission(PermissionKey.CASHBOOK_MANAGE);
  const id = getText(formData, "id");
  const current = await prisma.cashTransaction.findUniqueOrThrow({ where: { id } });
  if (current.paymentId || current.expenseId) {
    redirectWithNotice("/buku-kas", "Transaksi otomatis harus dihapus dari menu sumbernya.", "error");
  }
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.updateMany({ where: { sourceType: "CASH", sourceId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.cashTransaction.update({ where: { id }, data: { deletedAt: new Date() } });
  });
  redirectWithNotice("/buku-kas", "Transaksi kas berhasil dihapus.");
}

export async function createAccount(formData: FormData) {
  await assertPermission(PermissionKey.ACCOUNTING_MANAGE);
  const parsed = parseWithNotice(accountSchema, {
    code: getText(formData, "code"),
    name: getText(formData, "name"),
    type: getText(formData, "type"),
  }, "/akuntansi?sheet=daftar-akun");
  const existing = await prisma.account.findUnique({ where: { code: parsed.code } });
  if (existing && !existing.deletedAt) {
    redirectWithNotice("/akuntansi?sheet=daftar-akun", "Kode akun sudah digunakan.", "error");
  }
  if (existing) {
    await prisma.account.update({
      where: { id: existing.id },
      data: { ...parsed, active: true, deletedAt: null },
    });
  } else {
    await prisma.account.create({ data: parsed });
  }
  redirectWithNotice("/akuntansi?sheet=daftar-akun", "Akun berhasil ditambahkan.");
}

export async function updateAccount(formData: FormData) {
  await assertPermission(PermissionKey.ACCOUNTING_MANAGE);
  const parsed = parseWithNotice(accountSchema, {
    code: getText(formData, "code"),
    name: getText(formData, "name"),
    type: getText(formData, "type"),
  }, "/akuntansi?sheet=daftar-akun");
  const id = getText(formData, "id");
  const current = await prisma.account.findUniqueOrThrow({
    where: { id },
    include: {
      _count: {
        select: {
          cashAssetEntries: true,
          cashContraEntries: true,
          expenseCategories: true,
          lines: true,
          paymentCategories: true,
        },
      },
    },
  });
  const usageCount = Object.values(current._count).reduce((total, count) => total + count, 0);
  const nextActive = getText(formData, "active") === "true";
  if (usageCount > 0 && (!nextActive || parsed.type !== current.type)) {
    redirectWithNotice(
      "/akuntansi?sheet=daftar-akun",
      "Akun yang sudah digunakan tidak dapat dinonaktifkan atau diubah jenisnya.",
      "error",
    );
  }
  const duplicate = await prisma.account.findFirst({
    where: { code: parsed.code, deletedAt: null, NOT: { id } },
  });
  if (duplicate) {
    redirectWithNotice("/akuntansi?sheet=daftar-akun", "Kode akun sudah digunakan.", "error");
  }
  await prisma.account.update({
    where: { id },
    data: { ...parsed, active: nextActive },
  });
  redirectWithNotice("/akuntansi?sheet=daftar-akun", "Akun berhasil diubah.");
}

export async function deleteAccount(formData: FormData) {
  await assertPermission(PermissionKey.ACCOUNTING_MANAGE);
  const id = getText(formData, "id");
  const account = await prisma.account.findUniqueOrThrow({
    where: { id },
    include: {
      _count: {
        select: {
          cashAssetEntries: true,
          cashContraEntries: true,
          expenseCategories: true,
          lines: true,
          paymentCategories: true,
        },
      },
    },
  });
  const usageCount = Object.values(account._count).reduce((total, count) => total + count, 0);
  if (usageCount > 0) {
    redirectWithNotice(
      "/akuntansi?sheet=daftar-akun",
      "Akun sudah terhubung ke transaksi atau master keuangan dan tidak dapat dihapus.",
      "error",
    );
  }
  await prisma.account.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
  redirectWithNotice("/akuntansi?sheet=daftar-akun", "Akun berhasil dihapus.");
}

export async function createJournalEntry(formData: FormData) {
  const user = await assertPermission(PermissionKey.ACCOUNTING_MANAGE);
  if (user.role !== "ADMIN") {
    redirectWithNotice("/akuntansi?sheet=jurnal", "Jurnal penyesuaian manual hanya dapat dibuat oleh administrator.", "error");
  }
  const parsed = parseWithNotice(manualJournalSchema, {
    amount: getText(formData, "amount"),
    creditAccountId: getText(formData, "creditAccountId"),
    date: getText(formData, "date"),
    debitAccountId: getText(formData, "debitAccountId"),
    description: getText(formData, "description"),
  }, "/akuntansi?sheet=jurnal");
  const { amount, creditAccountId, debitAccountId } = parsed;
  await Promise.all([
    assertActiveAccount(debitAccountId, "/akuntansi?sheet=jurnal"),
    assertActiveAccount(creditAccountId, "/akuntansi?sheet=jurnal"),
  ]);
  if (debitAccountId === creditAccountId) {
    redirectWithNotice("/akuntansi?sheet=jurnal", "Akun debit dan kredit harus berbeda.", "error");
  }
  const lines = [
    { accountId: debitAccountId, debit: amount, credit: 0 },
    { accountId: creditAccountId, debit: 0, credit: amount },
  ];
  assertBalanced(lines);
  await prisma.journalEntry.create({
    data: {
      number: `JU-${Date.now()}`,
      date: parsed.date,
      description: parsed.description,
      sourceType: "MANUAL",
      postedBy: user.name,
      lines: { create: lines },
    },
  });
  redirectWithNotice("/akuntansi?sheet=jurnal", "Jurnal umum berhasil diposting.");
}

export async function deleteJournalEntry(formData: FormData) {
  await assertPermission(PermissionKey.ACCOUNTING_MANAGE);
  const id = getText(formData, "id");
  const journal = await prisma.journalEntry.findUniqueOrThrow({ where: { id } });
  if (journal.sourceType && journal.sourceType !== "MANUAL") {
    redirectWithNotice("/akuntansi", "Jurnal otomatis harus dihapus dari transaksi sumber.", "error");
  }
  await prisma.journalEntry.update({ where: { id }, data: { deletedAt: new Date() } });
  redirectWithNotice("/akuntansi", "Jurnal manual berhasil dihapus.");
}

export async function saveReceiptSetting(formData: FormData) {
  await assertPermission(PermissionKey.RECEIPT_SETTING);
  const parsed = parseWithNotice(receiptSettingSchema, {
    schoolName: getText(formData, "schoolName"),
    schoolAddress: getText(formData, "schoolAddress"),
    schoolPhone: getText(formData, "schoolPhone"),
    headerText: getText(formData, "headerText"),
    footerText: getText(formData, "footerText"),
    logoUrl: getText(formData, "logoUrl"),
    signatureName: getText(formData, "signatureName"),
    signatureTitle: getText(formData, "signatureTitle"),
  }, "/pengaturan/kwitansi");
  await prisma.receiptSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      ...parsed,
    },
    update: parsed,
  });
  revalidatePath("/kwitansi/[id]", "page");
  redirectWithNotice("/pengaturan/kwitansi", "Format header dan footer kwitansi berhasil disimpan.");
}
