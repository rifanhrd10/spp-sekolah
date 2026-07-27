"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  AccountType,
  CashType,
  InvoiceStatus,
  PaymentType,
  PermissionKey,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSession, createSession, getCurrentUser, requireUser } from "@/lib/auth";
import { writeActivityLog } from "@/lib/activity-log";
import { assertBalanced, expenseReceiptNumber, postExpenseAccounting, postPaymentAccounting, receiptNumber } from "@/lib/accounting";
import { hashPassword, verifyPassword } from "@/lib/password";
import { canAccessExpenseCategory, hasPermission, normalizeRoleCode } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function toPaymentType(code: string): PaymentType {
  const validTypes: PaymentType[] = ["SPP", "SUMBANGAN", "KEGIATAN", "SERAGAM", "LAINNYA"];
  if (validTypes.includes(code as PaymentType)) {
    return code as PaymentType;
  }
  return PaymentType.LAINNYA;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(6),
});

const classRoomSchema = z.object({
  name: z.string().min(2),
  level: z.string().min(1),
  homeroom: z.string().optional(),
});

const categorySchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(3),
  defaultAmount: z.coerce.number().int().min(0),
  description: z.string().optional(),
  revenueAccountId: z.string().min(1),
});

const userSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.string().min(1),
});

const userUpdateSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  password: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(6).optional(),
  ),
  role: z.string().min(1),
});

const roleSchema = z.object({
  name: z.string().min(3),
});

const roleUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(3),
  active: z.preprocess((value) => value === "true", z.boolean()),
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

const paymentBatchSchema = z.object({
  assetAccountId: z.string().min(1),
  paidAt: z.coerce.date(),
  method: z.string().min(3),
  note: z.string().optional(),
  receivedBy: z.string().min(3),
  lines: z.array(z.object({
    invoiceId: z.string().min(1),
    amount: z.coerce.number().int().positive(),
  })).min(1),
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

const expenseBatchSchema = z.object({
  assetAccountId: z.string().min(1),
  spentAt: z.coerce.date(),
  createdBy: z.string().min(3),
  lines: z.array(z.object({
    categoryId: z.string().min(1),
    title: z.string().min(3),
    amount: z.coerce.number().int().positive(),
    vendor: z.string().optional(),
    note: z.string().optional(),
  })).min(1),
});

const expenseReceiptUpdateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  categoryIds: z.array(z.string().min(1)).min(1),
  titles: z.array(z.string().min(3)).min(1),
  amounts: z.array(z.coerce.number().int().positive()).min(1),
  vendors: z.array(z.string().optional()).min(1),
  notes: z.array(z.string().optional()).min(1),
  assetAccountId: z.string().min(1),
  spentAt: z.coerce.date(),
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

const paymentReceiptUpdateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  amounts: z.array(z.coerce.number().int().positive()).min(1),
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
  signatureName: z.string().optional(),
  signatureTitle: z.string().optional(),
});

const receiptLogoMaxSize = 2 * 1024 * 1024;
const receiptLogoMimeTypes = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
]);
const receiptLogoUploadPath = "/uploads/kwitansi";
const receiptLogoUploadDir = join(process.cwd(), "public", "uploads", "kwitansi");

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getTexts(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => (typeof value === "string" ? value.trim() : ""));
}

function getFile(formData: FormData, key: string) {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

async function saveReceiptLogo(file: File) {
  const mimeExtension = receiptLogoMimeTypes.get(file.type);
  const nameExtension = extname(file.name).toLowerCase();
  const extension = mimeExtension ?? ([".png", ".jpg", ".jpeg", ".webp"].includes(nameExtension) ? nameExtension : "");

  if (!extension) {
    redirectWithNotice("/pengaturan/kwitansi", "Logo harus berupa file PNG, JPG, atau WEBP.", "error");
  }

  if (file.size > receiptLogoMaxSize) {
    redirectWithNotice("/pengaturan/kwitansi", "Ukuran logo maksimal 2 MB.", "error");
  }

  await mkdir(receiptLogoUploadDir, { recursive: true });
  const filename = `logo-${randomUUID()}${extension === ".jpeg" ? ".jpg" : extension}`;
  await writeFile(join(receiptLogoUploadDir, filename), Buffer.from(await file.arrayBuffer()));
  return `${receiptLogoUploadPath}/${filename}`;
}

async function deleteReceiptLogo(logoUrl: string | null | undefined) {
  if (!logoUrl?.startsWith(`${receiptLogoUploadPath}/`)) return;
  try {
    await unlink(join(process.cwd(), "public", logoUrl));
  } catch {
    // File may already be gone; the database state is still authoritative.
  }
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

function expenseReturnPath(formData: FormData) {
  const returnTo = getText(formData, "returnTo");
  return returnTo.startsWith("/transaksi/pengeluaran")
    ? returnTo
    : "/transaksi/pengeluaran";
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

async function logActivity(
  user: Awaited<ReturnType<typeof requireUser>> | Awaited<ReturnType<typeof getCurrentUser>> | null,
  action: string,
  entity: string,
  entityId?: string | null,
  before?: unknown,
  after?: unknown,
) {
  await writeActivityLog({
    action,
    entity,
    entityId,
    user,
    before,
    after,
  });
}

function assertCanManageSuperadmin(currentUser: { role: string }, targetRole: string, path = "/master/pengguna") {
  if (targetRole === "SUPERADMIN" && currentUser.role !== "SUPERADMIN") {
    redirectWithNotice(path, "Data superadmin tidak dapat diakses.", "error");
  }
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

async function assertActiveRole(role: string, path: string) {
  const existing = await prisma.role.findFirst({
    where: { code: role, active: true, deletedAt: null },
    select: { code: true },
  });

  if (!existing) {
    redirectWithNotice(path, "Role yang dipilih tidak tersedia atau sudah nonaktif.", "error");
  }
}

async function assertExpenseCategoryAccess(role: string, categoryIds: string[], path: string) {
  const uniqueCategoryIds = [...new Set(categoryIds)];
  const checks = await Promise.all(uniqueCategoryIds.map((categoryId) => canAccessExpenseCategory(role, categoryId)));
  if (checks.some((allowed) => !allowed)) {
    redirectWithNotice(path, "Anda tidak memiliki akses ke salah satu kategori pengeluaran yang dipilih.", "error");
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
    await logActivity(null, "LOGIN_FAILED", "Auth", null, null, { reason: "VALIDATION_FAILED" });
    redirect("/login?error=1");
  }

  const user = await prisma.user.findFirst({
    where: { email: parsed.data.email, active: true, deletedAt: null },
  });

  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    await logActivity(null, "LOGIN_FAILED", "Auth", null, null, { username: parsed.data.email });
    redirect("/login?error=1");
  }

  await createSession(user.id);
  await logActivity(user, "LOGIN", "Auth", user.id, null, { email: user.email, role: user.role });
  redirect("/dashboard");
}

export async function logoutAction() {
  const user = await getCurrentUser();
  await logActivity(user, "LOGOUT", "Auth", user?.id, { email: user?.email, role: user?.role }, null);
  await clearSession();
  redirect("/login");
}

export async function createClassRoom(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.MASTER_CLASS);
  const parsed = parseWithNotice(classRoomSchema, {
    name: getText(formData, "name"),
    level: getText(formData, "level"),
    homeroom: getText(formData, "homeroom"),
  }, "/master/kelas");

  const existing = await prisma.classRoom.findUnique({ where: { name: parsed.name } });
  if (existing && !existing.deletedAt) {
    redirectWithNotice("/master/kelas", "Nama kelas sudah digunakan.", "error");
  }
  let saved;
  if (existing) {
    saved = await prisma.classRoom.update({
      where: { id: existing.id },
      data: { ...parsed, active: true, deletedAt: null },
    });
  } else {
    saved = await prisma.classRoom.create({ data: parsed });
  }
  await logActivity(currentUser, existing ? "RESTORE" : "CREATE", "ClassRoom", saved.id, existing, saved);

  revalidatePath("/master/kelas");
  revalidatePath("/master/siswa");
  redirectWithNotice("/master/kelas", "Data kelas berhasil disimpan.");
}

export async function createPaymentCategory(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.MASTER_PAYMENT);
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

  const data = {
    ...parsed,
    revenueAccountId: parsed.revenueAccountId,
    active: true,
    deletedAt: null,
  };
  const existing = await prisma.paymentCategory.findFirst({ where: { code: parsed.code } });
  if (existing && !existing.deletedAt) {
    redirectWithNotice(
      "/master/jenis-pembayaran",
      "Kode jenis pembayaran sudah digunakan.",
      "error",
    );
  }

  try {
    const saved = existing
      ? await prisma.paymentCategory.update({ where: { id: existing.id }, data })
      : await prisma.paymentCategory.create({ data });
    await logActivity(currentUser, existing ? "RESTORE" : "CREATE", "PaymentCategory", saved.id, existing, saved);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirectWithNotice(
        "/master/jenis-pembayaran",
        "Kode jenis pembayaran sudah digunakan.",
        "error",
      );
    }
    throw error;
  }

  revalidatePath("/master/jenis-pembayaran");
  revalidatePath("/transaksi/tagihan");
  redirectWithNotice("/master/jenis-pembayaran", "Jenis pembayaran berhasil disimpan.");
}

export async function createUser(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.USER_MANAGE);

  const parsed = parseWithNotice(userSchema, {
    name: getText(formData, "name"),
    email: getText(formData, "email"),
    password: getText(formData, "password"),
    role: getText(formData, "role"),
  }, "/master/pengguna");
  assertCanManageSuperadmin(currentUser, parsed.role);
  await assertActiveRole(parsed.role, "/master/pengguna");

  const existing = await prisma.user.findUnique({ where: { email: parsed.email } });
  if (existing && !existing.deletedAt) {
    redirectWithNotice("/master/pengguna", "Email sudah digunakan oleh pengguna lain.", "error");
  }
  let saved;
  if (existing) {
    saved = await prisma.user.update({
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
    saved = await prisma.user.create({
      data: {
        name: parsed.name,
        email: parsed.email,
        passwordHash: hashPassword(parsed.password),
        role: parsed.role,
      },
    });
  }
  await logActivity(currentUser, existing ? "RESTORE" : "CREATE", "User", saved.id, existing, saved);

  revalidatePath("/master/pengguna");
  redirectWithNotice("/master/pengguna", "Data pengguna berhasil disimpan.");
}

export async function createStudent(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.MASTER_STUDENT);
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

  let saved;
  if (existing?.deletedAt) {
    saved = await prisma.student.update({
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
    saved = await prisma.student.create({
      data: {
        ...parsed.data,
        promotionStatus: parsed.data.promotionStatus || "BELUM_DITENTUKAN",
        classNameSnapshot: classRoom.name,
        deletedAt: null,
      },
    });
  }
  await logActivity(currentUser, existing?.deletedAt ? "RESTORE" : "CREATE", "Student", saved.id, existing, saved);

  revalidatePath("/master/siswa");
  revalidatePath("/dashboard");
  redirectWithNotice(returnPath, "Data siswa berhasil disimpan.");
}

export async function createInvoice(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.INVOICE_MANAGE);
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

  const saved = await prisma.invoice.create({
    data: {
      ...parsed,
      type: toPaymentType(category.code),
      status: InvoiceStatus.BELUM_BAYAR,
    },
  });
  await logActivity(currentUser, "CREATE", "Invoice", saved.id, null, saved);

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

  const bulkResult = await prisma.$transaction(async (tx) => {
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
        type: toPaymentType(category.code),
        title: parsed.title,
        amount: parsed.amount,
        dueDate: parsed.dueDate,
        academicYear: parsed.academicYear,
        period: parsed.period,
        status: InvoiceStatus.BELUM_BAYAR,
        description: parsed.description,
      })),
    });
    return {
      batch,
      invoiceCount: targetStudents.length,
      skippedDuplicateCount: alreadyBilled.size,
      studentIds: targetStudents.map((student) => student.id),
    };
  });
  await logActivity(currentUser, "CREATE", "BillingBatch", bulkResult.batch.id, null, bulkResult);

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
  const invoiceIds = getTexts(formData, "invoiceId");
  const amounts = getTexts(formData, "amount");
  const parsed = parseWithNotice(paymentBatchSchema, {
    assetAccountId: getText(formData, "assetAccountId"),
    paidAt: getText(formData, "paidAt"),
    method: getText(formData, "method"),
    note: getText(formData, "note"),
    receivedBy: currentUser.name,
    lines: invoiceIds.map((invoiceId, index) => ({
      invoiceId,
      amount: amounts[index] ?? "",
    })),
  }, "/transaksi/pembayaran");
  await assertActiveAccount(
    parsed.assetAccountId,
    "/transaksi/pembayaran",
    AccountType.ASET,
  );

  const invoiceIdSet = new Set(parsed.lines.map((line) => line.invoiceId));
  if (invoiceIdSet.size !== parsed.lines.length) {
    redirectWithNotice("/transaksi/pembayaran", "Tagihan yang sama tidak boleh dipilih lebih dari sekali.", "error");
  }

  const invoicesBeforePayment = await prisma.invoice.findMany({
    where: { id: { in: [...invoiceIdSet] }, deletedAt: null },
    include: { student: true, payments: { where: { deletedAt: null }, select: { amount: true } } },
  });

  if (invoicesBeforePayment.length !== parsed.lines.length) {
    redirectWithNotice("/transaksi/pembayaran", "Tagihan tidak ditemukan.", "error");
  }

  const studentIds = new Set(invoicesBeforePayment.map((invoice) => invoice.studentId));
  if (studentIds.size !== 1) {
    redirectWithNotice("/transaksi/pembayaran", "Satu kwitansi hanya boleh berisi tagihan dari satu siswa.", "error");
  }

  const invoicesById = new Map(invoicesBeforePayment.map((invoice) => [invoice.id, invoice]));
  for (const line of parsed.lines) {
    const invoice = invoicesById.get(line.invoiceId);
    const paidBefore = invoice?.payments.reduce((total, payment) => total + payment.amount, 0) ?? 0;
    const remainingBefore = Math.max((invoice?.amount ?? 0) - paidBefore, 0);
    if (line.amount > remainingBefore) {
      redirectWithNotice(
        "/transaksi/pembayaran",
        `Nominal pembayaran untuk ${invoice?.title ?? "tagihan"} melebihi sisa tagihan.`,
        "error",
      );
    }
  }

  const receiptNo = receiptNumber();
  const createdPayments = await prisma.$transaction(async (tx) => {
    const createdPayments = [];
    for (const line of parsed.lines) {
      const invoice = invoicesById.get(line.invoiceId)!;
      const created = await tx.payment.create({
        data: {
          invoiceId: line.invoiceId,
          amount: line.amount,
          paidAt: parsed.paidAt,
          method: parsed.method,
          note: parsed.note,
          receiptNo,
          receivedBy: currentUser.name,
        },
      });

      await recalculateInvoiceStatus(tx, line.invoiceId);
      await postPaymentAccounting(tx, {
        paymentId: created.id,
        invoiceId: line.invoiceId,
        assetAccountId: parsed.assetAccountId,
        amount: created.amount,
        date: created.paidAt,
        description: `Pembayaran ${invoice.title} - ${invoice.student.name}`,
        createdBy: currentUser.name,
      });
      createdPayments.push(created);
    }
    return createdPayments;
  });
  const firstPayment = createdPayments[0];
  await logActivity(currentUser, "CREATE", "PaymentReceipt", receiptNo, null, {
    receiptNo,
    payments: createdPayments,
    invoicesBeforePayment,
    assetAccountId: parsed.assetAccountId,
  });

  revalidatePath("/transaksi/pembayaran");
  revalidatePath("/transaksi/tagihan");
  revalidatePath("/dashboard");
  revalidatePath("/laporan");
  revalidatePath("/buku-kas");
  revalidatePath("/akuntansi");
  redirect(`/kwitansi/${firstPayment.id}?new=1`);
}

export async function createExpense(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.EXPENSE_MANAGE);
  const returnPath = expenseReturnPath(formData);
  const categoryIds = getTexts(formData, "categoryId");
  const titles = getTexts(formData, "title");
  const amounts = getTexts(formData, "amount");
  const vendors = formData.getAll("vendor").map((value) => (typeof value === "string" ? value.trim() : ""));
  const notes = formData.getAll("note").map((value) => (typeof value === "string" ? value.trim() : ""));
  const parsed = parseWithNotice(expenseBatchSchema, {
    assetAccountId: getText(formData, "assetAccountId"),
    spentAt: getText(formData, "spentAt"),
    createdBy: currentUser.name,
    lines: categoryIds.map((categoryId, index) => ({
      categoryId,
      title: titles[index] ?? "",
      amount: amounts[index] ?? "",
      vendor: vendors[index] ?? "",
      note: notes[index] ?? "",
    })),
  }, returnPath);
  await assertActiveAccount(
    parsed.assetAccountId,
    returnPath,
    AccountType.ASET,
  );
  await assertExpenseCategoryAccess(currentUser.role, parsed.lines.map((line) => line.categoryId), returnPath);
  const categories = await prisma.expenseCategory.findMany({
    where: {
      id: { in: [...new Set(parsed.lines.map((line) => line.categoryId))] },
      active: true,
      deletedAt: null,
    },
  });
  if (categories.length !== new Set(parsed.lines.map((line) => line.categoryId)).size) {
    redirectWithNotice(returnPath, "Kategori pengeluaran tidak ditemukan atau sudah nonaktif.", "error");
  }
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const receiptNo = expenseReceiptNumber();

  const createdExpenses = await prisma.$transaction(async (tx) => {
    const createdItems = [];
    for (const line of parsed.lines) {
      const category = categoriesById.get(line.categoryId)!;
      const expense = await tx.expense.create({
        data: {
          receiptNo,
          categoryId: line.categoryId,
          categoryNameSnapshot: category.name,
          title: line.title,
          amount: line.amount,
          spentAt: parsed.spentAt,
          vendor: line.vendor,
          note: line.note,
          createdBy: currentUser.name,
        },
      });
      await postExpenseAccounting(tx, {
        expenseId: expense.id,
        assetAccountId: parsed.assetAccountId,
        amount: expense.amount,
        date: expense.spentAt,
        description: `Pengeluaran ${expense.title}`,
        createdBy: currentUser.name,
        expenseAccountId: category.expenseAccountId,
      });
      createdItems.push(expense);
    }
    return createdItems;
  });
  await logActivity(currentUser, "CREATE", "ExpenseReceipt", receiptNo, null, {
    receiptNo,
    expenses: createdExpenses,
    assetAccountId: parsed.assetAccountId,
  });

  revalidatePath("/transaksi/pengeluaran");
  revalidatePath("/dashboard");
  revalidatePath("/laporan");
  revalidatePath("/buku-kas");
  revalidatePath("/akuntansi");
  redirectWithNotice(returnPath, `${parsed.lines.length} pengeluaran berhasil disimpan dalam satu nota.`);
}

export async function ensureAuthenticated() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
}

export async function updateClassRoom(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.MASTER_CLASS);
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
  const before = await prisma.classRoom.findUniqueOrThrow({ where: { id } });
  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.classRoom.update({ where: { id }, data: parsed });
    await tx.student.updateMany({ where: { classRoomId: id }, data: { classNameSnapshot: parsed.name } });
    return updated;
  });
  await logActivity(currentUser, "UPDATE", "ClassRoom", id, before, after);
  redirectWithNotice("/master/kelas", "Data kelas berhasil diubah.");
}

export async function deleteClassRoom(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.MASTER_CLASS);
  const id = getText(formData, "id");
  const students = await prisma.student.count({ where: { classRoomId: id, deletedAt: null } });
  if (students) redirectWithNotice("/master/kelas", "Kelas masih memiliki siswa dan tidak dapat dihapus.", "error");
  const before = await prisma.classRoom.findUniqueOrThrow({ where: { id } });
  const after = await prisma.classRoom.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
  await logActivity(currentUser, "DELETE", "ClassRoom", id, before, after);
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
  await logActivity(currentUser, "UPDATE", "StudentClassPromotion", source.id, null, {
    source,
    target,
    studentIds: students.map((student) => student.id),
    ...parsed,
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
  const currentUser = await assertPermission(PermissionKey.MASTER_PAYMENT);
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
  const before = await prisma.paymentCategory.findUniqueOrThrow({ where: { id } });
  const duplicate = await prisma.paymentCategory.findFirst({
    where: { code: parsed.code, deletedAt: null, NOT: { id } },
    select: { id: true },
  });
  if (duplicate) {
    redirectWithNotice(
      "/master/jenis-pembayaran",
      "Kode jenis pembayaran sudah digunakan.",
      "error",
    );
  }
  let after;
  try {
    after = await prisma.paymentCategory.update({
      where: { id },
      data: { ...parsed, revenueAccountId: parsed.revenueAccountId || null },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirectWithNotice(
        "/master/jenis-pembayaran",
        "Kode jenis pembayaran sudah digunakan.",
        "error",
      );
    }
    throw error;
  }
  await logActivity(currentUser, "UPDATE", "PaymentCategory", id, before, after);
  redirectWithNotice("/master/jenis-pembayaran", "Jenis pembayaran berhasil diubah.");
}

export async function deletePaymentCategory(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.MASTER_PAYMENT);
  const id = getText(formData, "id");
  const before = await prisma.paymentCategory.findUniqueOrThrow({ where: { id } });
  const after = await prisma.paymentCategory.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
  await logActivity(currentUser, "DELETE", "PaymentCategory", id, before, after);
  redirectWithNotice("/master/jenis-pembayaran", "Jenis pembayaran berhasil dihapus.");
}

export async function createExpenseCategory(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.MASTER_EXPENSE_CATEGORY);
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
  let saved;
  if (existing) {
    saved = await prisma.expenseCategory.update({ where: { id: existing.id }, data });
  } else {
    saved = await prisma.expenseCategory.create({ data });
  }
  await logActivity(currentUser, existing ? "RESTORE" : "CREATE", "ExpenseCategory", saved.id, existing, saved);
  revalidatePath("/master/kategori-pengeluaran");
  revalidatePath("/transaksi/pengeluaran");
  redirectWithNotice("/master/kategori-pengeluaran", "Kategori pengeluaran berhasil ditambahkan.");
}

export async function updateExpenseCategory(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.MASTER_EXPENSE_CATEGORY);
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
  const before = await prisma.expenseCategory.findUniqueOrThrow({ where: { id } });
  const after = await prisma.expenseCategory.update({
    where: { id },
    data: {
      ...parsed,
      expenseAccountId: parsed.expenseAccountId || null,
      active: getText(formData, "active") === "true",
    },
  });
  await logActivity(currentUser, "UPDATE", "ExpenseCategory", id, before, after);
  revalidatePath("/master/kategori-pengeluaran");
  revalidatePath("/transaksi/pengeluaran");
  redirectWithNotice("/master/kategori-pengeluaran", "Kategori pengeluaran berhasil diubah.");
}

export async function deleteExpenseCategory(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.MASTER_EXPENSE_CATEGORY);
  const id = getText(formData, "id");
  const used = await prisma.expense.count({ where: { categoryId: id, deletedAt: null } });
  if (used) {
    redirectWithNotice(
      "/master/kategori-pengeluaran",
      "Kategori sudah dipakai pada transaksi. Nonaktifkan kategori sebagai gantinya.",
      "error",
    );
  }
  const before = await prisma.expenseCategory.findUniqueOrThrow({ where: { id } });
  const after = await prisma.expenseCategory.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
  await logActivity(currentUser, "DELETE", "ExpenseCategory", id, before, after);
  redirectWithNotice("/master/kategori-pengeluaran", "Kategori pengeluaran berhasil dihapus.");
}

export async function updateUser(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.USER_MANAGE);
  const id = getText(formData, "id");
  const parsed = parseWithNotice(userUpdateSchema, {
    name: getText(formData, "name"),
    email: getText(formData, "email"),
    password: getText(formData, "password"),
    role: getText(formData, "role"),
  }, "/master/pengguna");
  assertCanManageSuperadmin(currentUser, parsed.role);
  await assertActiveRole(parsed.role, "/master/pengguna");
  const before = await prisma.user.findUniqueOrThrow({ where: { id } });
  assertCanManageSuperadmin(currentUser, before.role);
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
  const after = await prisma.user.update({ where: { id }, data });
  await logActivity(currentUser, "UPDATE", "User", id, before, after);
  redirectWithNotice("/master/pengguna", "Pengguna berhasil diubah.");
}

export async function deleteUser(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.USER_MANAGE);
  const id = getText(formData, "id");
  if (id === currentUser.id) redirectWithNotice("/master/pengguna", "Akun yang sedang digunakan tidak dapat dihapus.", "error");
  const before = await prisma.user.findUniqueOrThrow({ where: { id } });
  assertCanManageSuperadmin(currentUser, before.role);
  const after = await prisma.user.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
  await logActivity(currentUser, "DELETE", "User", id, before, after);
  redirectWithNotice("/master/pengguna", "Pengguna berhasil dihapus.");
}

export async function createRole(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.ROLE_MANAGE);
  const parsed = parseWithNotice(roleSchema, {
    name: getText(formData, "name"),
  }, "/master/pengguna");
  const code = normalizeRoleCode(parsed.name);
  assertCanManageSuperadmin(currentUser, code);

  if (!code) {
    redirectWithNotice("/master/pengguna", "Kode role belum valid.", "error");
  }

  const existing = await prisma.role.findUnique({ where: { code } });
  if (existing && !existing.deletedAt) {
    redirectWithNotice("/master/pengguna", "Role dengan kode tersebut sudah ada.", "error");
  }

  let saved;
  if (existing) {
    saved = await prisma.role.update({
      where: { id: existing.id },
      data: {
        name: parsed.name,
        active: true,
        deletedAt: null,
      },
    });
  } else {
    saved = await prisma.role.create({ data: { code, name: parsed.name } });
  }
  await logActivity(currentUser, existing ? "RESTORE" : "CREATE", "Role", saved.id, existing, saved);

  revalidatePath("/master/pengguna");
  revalidatePath("/", "layout");
  redirectWithNotice("/master/pengguna", "Role berhasil ditambahkan.");
}

export async function updateRole(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.ROLE_MANAGE);
  const parsed = parseWithNotice(roleUpdateSchema, {
    id: getText(formData, "id"),
    name: getText(formData, "name"),
    active: getText(formData, "active"),
  }, "/master/pengguna");
  const role = await prisma.role.findUniqueOrThrow({ where: { id: parsed.id } });
  assertCanManageSuperadmin(currentUser, role.code);
  if (role.code === "ADMIN" && !parsed.active) {
    redirectWithNotice("/master/pengguna", "Role Administrator tidak boleh dinonaktifkan.", "error");
  }
  if (role.code === "SUPERADMIN" && !parsed.active) {
    redirectWithNotice("/master/pengguna", "Role Superadmin tidak boleh dinonaktifkan.", "error");
  }
  const after = await prisma.role.update({
    where: { id: parsed.id },
    data: {
      name: parsed.name,
      active: parsed.active,
      deletedAt: null,
    },
  });
  await logActivity(currentUser, "UPDATE", "Role", role.id, role, after);
  revalidatePath("/master/pengguna");
  revalidatePath("/", "layout");
  redirectWithNotice("/master/pengguna", "Role berhasil diubah.");
}

export async function deleteRole(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.ROLE_MANAGE);
  const id = getText(formData, "id");
  const role = await prisma.role.findUniqueOrThrow({ where: { id } });
  assertCanManageSuperadmin(currentUser, role.code);
  if (role.code === "ADMIN") {
    redirectWithNotice("/master/pengguna", "Role Administrator tidak boleh dihapus.", "error");
  }
  if (role.code === "SUPERADMIN") {
    redirectWithNotice("/master/pengguna", "Role Superadmin tidak boleh dihapus.", "error");
  }
  const used = await prisma.user.count({ where: { role: role.code, deletedAt: null } });
  if (used) {
    redirectWithNotice("/master/pengguna", "Role masih dipakai pengguna. Pindahkan pengguna ke role lain dulu.", "error");
  }
  const after = await prisma.role.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
  await logActivity(currentUser, "DELETE", "Role", id, role, after);
  revalidatePath("/master/pengguna");
  revalidatePath("/", "layout");
  redirectWithNotice("/master/pengguna", "Role berhasil dihapus.");
}

export async function updateRolePermissions(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.ROLE_MANAGE);
  const role = parseWithNotice(
    z.string().min(1),
    getText(formData, "role"),
    "/master/pengguna",
  );
  const selected = new Set(formData.getAll("permissions").filter((value): value is string => typeof value === "string"));
  const selectedExpenseCategories = new Set(formData.getAll("expenseCategoryIds").filter((value): value is string => typeof value === "string"));
  const roleRecord = await prisma.role.findFirst({ where: { code: role, deletedAt: null } });
  if (!roleRecord) {
    redirectWithNotice("/master/pengguna", "Role tidak ditemukan.", "error");
  }
  assertCanManageSuperadmin(currentUser, role);
  const permissionsBefore = await prisma.rolePermission.findMany({ where: { role } });
  const expensePermissionsBefore = await prisma.roleExpenseCategoryPermission.findMany({ where: { role } });
  const expenseCategories = await prisma.expenseCategory.findMany({
    where: { active: true, deletedAt: null },
    select: { id: true },
  });
  await prisma.$transaction(
    [
      ...Object.values(PermissionKey).map((permission) =>
        prisma.rolePermission.upsert({
          where: { role_permission: { role, permission } },
          create: { role, permission, allowed: selected.has(permission) },
          update: { allowed: selected.has(permission) },
        }),
      ),
      ...expenseCategories.map((category) =>
        prisma.roleExpenseCategoryPermission.upsert({
          where: { role_expenseCategoryId: { role, expenseCategoryId: category.id } },
          create: { role, expenseCategoryId: category.id, allowed: selectedExpenseCategories.has(category.id) },
          update: { allowed: selectedExpenseCategories.has(category.id) },
        }),
      ),
    ],
  );
  const [permissionsAfter, expensePermissionsAfter] = await Promise.all([
    prisma.rolePermission.findMany({ where: { role } }),
    prisma.roleExpenseCategoryPermission.findMany({ where: { role } }),
  ]);
  await logActivity(currentUser, "UPDATE", "RolePermissions", roleRecord.id, {
    permissions: permissionsBefore,
    expenseCategories: expensePermissionsBefore,
  }, {
    permissions: permissionsAfter,
    expenseCategories: expensePermissionsAfter,
  });
  revalidatePath("/", "layout");
  redirectWithNotice("/master/pengguna", `Hak akses ${roleRecord.name} berhasil diperbarui.`);
}

export async function updateStudent(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.MASTER_STUDENT);
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
  const before = await prisma.student.findUniqueOrThrow({ where: { id } });
  const after = await prisma.student.update({
    where: { id },
    data: parsed.data,
  });
  await logActivity(currentUser, "UPDATE", "Student", id, before, after);
  revalidatePath("/master/siswa");
  redirectWithNotice(returnPath, "Data siswa berhasil diubah.");
}

export async function deleteStudent(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.MASTER_STUDENT);
  const id = getText(formData, "id");
  const returnPath = studentReturnPath(formData);
  const before = await prisma.student.findUniqueOrThrow({ where: { id } });
  const after = await prisma.student.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
  await logActivity(currentUser, "DELETE", "Student", id, before, after);
  revalidatePath("/master/siswa");
  redirectWithNotice(returnPath, "Data siswa berhasil dihapus.");
}

export async function updateInvoice(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.INVOICE_MANAGE);
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
  const after = await prisma.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { ...parsed, type: toPaymentType(category.code) } });
    await recalculateInvoiceStatus(tx, id);
    return tx.invoice.findUniqueOrThrow({ where: { id } });
  });
  await logActivity(currentUser, "UPDATE", "Invoice", id, currentInvoice, after);
  redirectWithNotice("/transaksi/tagihan", "Tagihan berhasil diubah.");
}

export async function deleteInvoice(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.INVOICE_MANAGE);
  const id = getText(formData, "id");
  const payments = await prisma.payment.count({ where: { invoiceId: id, deletedAt: null } });
  if (payments) redirectWithNotice("/transaksi/tagihan", "Tagihan yang sudah memiliki pembayaran tidak dapat dihapus.", "error");
  const before = await prisma.invoice.findUniqueOrThrow({ where: { id } });
  const after = await prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
  await logActivity(currentUser, "DELETE", "Invoice", id, before, after);
  redirectWithNotice("/transaksi/tagihan", "Tagihan berhasil dihapus.");
}

export async function updatePayment(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.PAYMENT_MANAGE);
  const id = getText(formData, "id");
  const current = await prisma.payment.findUniqueOrThrow({ where: { id }, include: { invoice: true, cashEntry: true } });
  const currentJournal = await prisma.journalEntry.findFirst({
    where: { sourceType: "PAYMENT", sourceId: id },
    include: { lines: true },
  });
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
  const after = await prisma.payment.findUniqueOrThrow({ where: { id }, include: { invoice: true, cashEntry: true } });
  const afterJournal = await prisma.journalEntry.findFirst({
    where: { sourceType: "PAYMENT", sourceId: id },
    include: { lines: true },
  });
  await logActivity(currentUser, "UPDATE", "Payment", id, {
    payment: current,
    journal: currentJournal,
  }, {
    payment: after,
    journal: afterJournal,
  });
  redirectWithNotice("/transaksi/pembayaran", "Pembayaran berhasil diubah.");
}

export async function updatePaymentReceipt(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.PAYMENT_MANAGE);
  const parsed = parseWithNotice(paymentReceiptUpdateSchema, {
    ids: getTexts(formData, "id"),
    amounts: getTexts(formData, "amount"),
    assetAccountId: getText(formData, "assetAccountId"),
    paidAt: getText(formData, "paidAt"),
    method: getText(formData, "method"),
    note: getText(formData, "note"),
  }, "/transaksi/pembayaran");
  if (parsed.ids.length !== parsed.amounts.length) {
    redirectWithNotice("/transaksi/pembayaran", "Jumlah item pembayaran tidak sesuai.", "error");
  }
  await assertActiveAccount(
    parsed.assetAccountId,
    "/transaksi/pembayaran",
    AccountType.ASET,
  );

  const currentPayments = await prisma.payment.findMany({
    where: { id: { in: parsed.ids }, deletedAt: null },
    include: { invoice: true, cashEntry: true },
  });
  if (currentPayments.length !== parsed.ids.length) {
    redirectWithNotice("/transaksi/pembayaran", "Pembayaran tidak ditemukan.", "error");
  }
  const receiptNumbers = new Set(currentPayments.map((payment) => payment.receiptNo ?? payment.id));
  if (receiptNumbers.size !== 1) {
    redirectWithNotice("/transaksi/pembayaran", "Item yang diedit bukan berasal dari kwitansi yang sama.", "error");
  }
  const journalsBefore = await prisma.journalEntry.findMany({
    where: { sourceType: "PAYMENT", sourceId: { in: currentPayments.map((payment) => payment.id) } },
    include: { lines: true },
  });

  const amountByPaymentId = new Map(parsed.ids.map((id, index) => [id, parsed.amounts[index]]));
  for (const payment of currentPayments) {
    const nextAmount = amountByPaymentId.get(payment.id) ?? 0;
    const paidOther = await prisma.payment.aggregate({
      where: { invoiceId: payment.invoiceId, deletedAt: null, NOT: { id: payment.id } },
      _sum: { amount: true },
    });
    if ((paidOther._sum.amount ?? 0) + nextAmount > payment.invoice.amount) {
      redirectWithNotice(
        "/transaksi/pembayaran",
        `Nominal pembayaran untuk ${payment.invoice.title} melebihi sisa tagihan.`,
        "error",
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const payment of currentPayments) {
      const amount = amountByPaymentId.get(payment.id)!;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          amount,
          paidAt: parsed.paidAt,
          method: parsed.method,
          note: parsed.note,
        },
      });
      const cashEntry = await tx.cashTransaction.findFirst({ where: { paymentId: payment.id, deletedAt: null } });
      await tx.cashTransaction.updateMany({
        where: { paymentId: payment.id },
        data: { amount, date: parsed.paidAt, assetAccountId: parsed.assetAccountId },
      });
      const journal = await tx.journalEntry.findFirst({ where: { sourceType: "PAYMENT", sourceId: payment.id } });
      if (journal) {
        await tx.journalLine.updateMany({
          where: { journalEntryId: journal.id, debit: { gt: 0 } },
          data: { debit: amount, accountId: parsed.assetAccountId },
        });
        await tx.journalLine.updateMany({
          where: { journalEntryId: journal.id, credit: { gt: 0 } },
          data: {
            credit: amount,
            ...(cashEntry?.contraAccountId ? { accountId: cashEntry.contraAccountId } : {}),
          },
        });
        await tx.journalEntry.update({ where: { id: journal.id }, data: { date: parsed.paidAt } });
      }
      await recalculateInvoiceStatus(tx, payment.invoiceId);
    }
  });
  const paymentsAfter = await prisma.payment.findMany({
    where: { id: { in: parsed.ids } },
    include: { invoice: true, cashEntry: true },
  });
  const journalsAfter = await prisma.journalEntry.findMany({
    where: { sourceType: "PAYMENT", sourceId: { in: currentPayments.map((payment) => payment.id) } },
    include: { lines: true },
  });
  await logActivity(currentUser, "UPDATE", "PaymentReceipt", [...receiptNumbers][0], {
    payments: currentPayments,
    journals: journalsBefore,
  }, {
    payments: paymentsAfter,
    journals: journalsAfter,
  });
  redirectWithNotice("/transaksi/pembayaran", "Kwitansi pembayaran berhasil diubah.");
}

export async function deletePayment(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.PAYMENT_MANAGE);
  const id = getText(formData, "id");
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id }, include: { cashEntry: true } });
  const journal = await prisma.journalEntry.findFirst({
    where: { sourceType: "PAYMENT", sourceId: id },
    include: { lines: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.updateMany({ where: { sourceType: "PAYMENT", sourceId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.cashTransaction.updateMany({ where: { paymentId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.payment.update({ where: { id }, data: { deletedAt: new Date() } });
    await recalculateInvoiceStatus(tx, payment.invoiceId);
  });
  const after = await prisma.payment.findUniqueOrThrow({ where: { id }, include: { cashEntry: true } });
  const journalAfter = await prisma.journalEntry.findFirst({
    where: { sourceType: "PAYMENT", sourceId: id },
    include: { lines: true },
  });
  await logActivity(currentUser, "DELETE", "Payment", id, {
    payment,
    journal,
  }, {
    payment: after,
    journal: journalAfter,
  });
  redirectWithNotice("/transaksi/pembayaran", "Pembayaran dan pencatatan kas terkait berhasil dihapus.");
}

export async function deletePaymentReceipt(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.PAYMENT_MANAGE);
  const id = getText(formData, "id");
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id } });
  const payments = await prisma.payment.findMany({
    where: payment.receiptNo
      ? { receiptNo: payment.receiptNo, deletedAt: null }
      : { id, deletedAt: null },
    include: { cashEntry: true },
  });
  const journals = await prisma.journalEntry.findMany({
    where: { sourceType: "PAYMENT", sourceId: { in: payments.map((item) => item.id) } },
    include: { lines: true },
  });
  await prisma.$transaction(async (tx) => {
    for (const item of payments) {
      await tx.journalEntry.updateMany({ where: { sourceType: "PAYMENT", sourceId: item.id, deletedAt: null }, data: { deletedAt: new Date() } });
      await tx.cashTransaction.updateMany({ where: { paymentId: item.id, deletedAt: null }, data: { deletedAt: new Date() } });
      await tx.payment.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
      await recalculateInvoiceStatus(tx, item.invoiceId);
    }
  });
  const after = await prisma.payment.findMany({
    where: { id: { in: payments.map((item) => item.id) } },
    include: { cashEntry: true },
  });
  const journalsAfter = await prisma.journalEntry.findMany({
    where: { sourceType: "PAYMENT", sourceId: { in: payments.map((item) => item.id) } },
    include: { lines: true },
  });
  await logActivity(currentUser, "DELETE", "PaymentReceipt", payment.receiptNo ?? id, {
    payments,
    journals,
  }, {
    payments: after,
    journals: journalsAfter,
  });
  redirectWithNotice("/transaksi/pembayaran", "Kwitansi dan semua item pembayaran terkait berhasil dihapus.");
}

export async function updateExpense(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.EXPENSE_MANAGE);
  const id = getText(formData, "id");
  const parsed = parseWithNotice(expenseSchema, {
    categoryId: getText(formData, "categoryId"),
    assetAccountId: getText(formData, "assetAccountId"),
    title: getText(formData, "title"),
    amount: getText(formData, "amount"),
    spentAt: getText(formData, "spentAt"),
    vendor: getText(formData, "vendor"),
    note: getText(formData, "note"),
    createdBy: currentUser.name,
  }, "/transaksi/pengeluaran");
  await assertExpenseCategoryAccess(currentUser.role, [parsed.categoryId], "/transaksi/pengeluaran");
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
  const before = await prisma.expense.findUniqueOrThrow({ where: { id }, include: { cashEntry: true } });
  const journalBefore = await prisma.journalEntry.findFirst({
    where: { sourceType: "EXPENSE", sourceId: id },
    include: { lines: true },
  });
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
  const after = await prisma.expense.findUniqueOrThrow({ where: { id }, include: { cashEntry: true } });
  const journalAfter = await prisma.journalEntry.findFirst({
    where: { sourceType: "EXPENSE", sourceId: id },
    include: { lines: true },
  });
  await logActivity(currentUser, "UPDATE", "Expense", id, {
    expense: before,
    journal: journalBefore,
  }, {
    expense: after,
    journal: journalAfter,
  });
  redirectWithNotice("/transaksi/pengeluaran", "Pengeluaran berhasil diubah.");
}

export async function deleteExpense(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.EXPENSE_MANAGE);
  const id = getText(formData, "id");
  const expense = await prisma.expense.findUniqueOrThrow({ where: { id }, include: { cashEntry: true } });
  const journal = await prisma.journalEntry.findFirst({
    where: { sourceType: "EXPENSE", sourceId: id },
    include: { lines: true },
  });
  if (expense.categoryId) {
    await assertExpenseCategoryAccess(currentUser.role, [expense.categoryId], "/transaksi/pengeluaran");
  }
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.updateMany({ where: { sourceType: "EXPENSE", sourceId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.cashTransaction.updateMany({ where: { expenseId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  });
  const after = await prisma.expense.findUniqueOrThrow({ where: { id }, include: { cashEntry: true } });
  const journalAfter = await prisma.journalEntry.findFirst({
    where: { sourceType: "EXPENSE", sourceId: id },
    include: { lines: true },
  });
  await logActivity(currentUser, "DELETE", "Expense", id, {
    expense,
    journal,
  }, {
    expense: after,
    journal: journalAfter,
  });
  redirectWithNotice("/transaksi/pengeluaran", "Pengeluaran dan pencatatan kas terkait berhasil dihapus.");
}

export async function updateExpenseReceipt(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.EXPENSE_MANAGE);
  const returnPath = expenseReturnPath(formData);
  const parsed = parseWithNotice(expenseReceiptUpdateSchema, {
    ids: getTexts(formData, "id"),
    categoryIds: getTexts(formData, "categoryId"),
    titles: getTexts(formData, "title"),
    amounts: getTexts(formData, "amount"),
    vendors: formData.getAll("vendor").map((value) => (typeof value === "string" ? value.trim() : "")),
    notes: formData.getAll("note").map((value) => (typeof value === "string" ? value.trim() : "")),
    assetAccountId: getText(formData, "assetAccountId"),
    spentAt: getText(formData, "spentAt"),
  }, returnPath);

  const expectedLength = parsed.ids.length;
  if (
    parsed.categoryIds.length !== expectedLength
    || parsed.titles.length !== expectedLength
    || parsed.amounts.length !== expectedLength
    || parsed.vendors.length !== expectedLength
    || parsed.notes.length !== expectedLength
  ) {
    redirectWithNotice(returnPath, "Jumlah item pengeluaran tidak sesuai.", "error");
  }
  await assertExpenseCategoryAccess(currentUser.role, parsed.categoryIds, returnPath);

  await assertActiveAccount(
    parsed.assetAccountId,
    returnPath,
    AccountType.ASET,
  );

  const currentExpenses = await prisma.expense.findMany({
    where: { id: { in: parsed.ids }, deletedAt: null },
  });
  if (currentExpenses.length !== expectedLength) {
    redirectWithNotice(returnPath, "Pengeluaran tidak ditemukan.", "error");
  }
  const receiptNumbers = new Set(currentExpenses.map((expense) => expense.receiptNo ?? expense.id));
  if (receiptNumbers.size !== 1) {
    redirectWithNotice(returnPath, "Item yang diedit bukan berasal dari nota yang sama.", "error");
  }
  const journalsBefore = await prisma.journalEntry.findMany({
    where: { sourceType: "EXPENSE", sourceId: { in: currentExpenses.map((expense) => expense.id) } },
    include: { lines: true },
  });

  const categories = await prisma.expenseCategory.findMany({
    where: {
      id: { in: [...new Set(parsed.categoryIds)] },
      active: true,
      deletedAt: null,
    },
  });
  if (categories.length !== new Set(parsed.categoryIds).size) {
    redirectWithNotice(returnPath, "Kategori pengeluaran tidak ditemukan atau sudah nonaktif.", "error");
  }
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const lineByExpenseId = new Map(parsed.ids.map((id, index) => [id, {
    categoryId: parsed.categoryIds[index],
    title: parsed.titles[index],
    amount: parsed.amounts[index],
    vendor: parsed.vendors[index],
    note: parsed.notes[index],
  }]));

  await prisma.$transaction(async (tx) => {
    for (const expense of currentExpenses) {
      const line = lineByExpenseId.get(expense.id)!;
      const category = categoriesById.get(line.categoryId)!;
      await tx.expense.update({
        where: { id: expense.id },
        data: {
          categoryId: line.categoryId,
          categoryNameSnapshot: category.name,
          title: line.title,
          amount: line.amount,
          spentAt: parsed.spentAt,
          vendor: line.vendor,
          note: line.note,
        },
      });
      await tx.cashTransaction.updateMany({
        where: { expenseId: expense.id },
        data: {
          amount: line.amount,
          date: parsed.spentAt,
          description: `Pengeluaran ${line.title}`,
          assetAccountId: parsed.assetAccountId,
          contraAccountId: category.expenseAccountId || null,
        },
      });
      const journal = await tx.journalEntry.findFirst({ where: { sourceType: "EXPENSE", sourceId: expense.id, deletedAt: null } });
      if (journal) {
        await tx.journalLine.updateMany({
          where: { journalEntryId: journal.id, debit: { gt: 0 } },
          data: {
            debit: line.amount,
            ...(category.expenseAccountId ? { accountId: category.expenseAccountId } : {}),
          },
        });
        await tx.journalLine.updateMany({
          where: { journalEntryId: journal.id, credit: { gt: 0 } },
          data: { credit: line.amount, accountId: parsed.assetAccountId },
        });
        await tx.journalEntry.update({ where: { id: journal.id }, data: { date: parsed.spentAt, description: `Pengeluaran ${line.title}` } });
      }
    }
  });
  const expensesAfter = await prisma.expense.findMany({
    where: { id: { in: parsed.ids } },
    include: { cashEntry: true },
  });
  const journalsAfter = await prisma.journalEntry.findMany({
    where: { sourceType: "EXPENSE", sourceId: { in: currentExpenses.map((expense) => expense.id) } },
    include: { lines: true },
  });
  await logActivity(currentUser, "UPDATE", "ExpenseReceipt", [...receiptNumbers][0], {
    expenses: currentExpenses,
    journals: journalsBefore,
  }, {
    expenses: expensesAfter,
    journals: journalsAfter,
  });
  redirectWithNotice(returnPath, "Nota pengeluaran berhasil diubah.");
}

export async function deleteExpenseReceipt(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.EXPENSE_MANAGE);
  const returnPath = expenseReturnPath(formData);
  const id = getText(formData, "id");
  const expense = await prisma.expense.findUniqueOrThrow({ where: { id } });
  const expenses = await prisma.expense.findMany({
    where: expense.receiptNo
      ? { receiptNo: expense.receiptNo, deletedAt: null }
      : { id, deletedAt: null },
    include: { cashEntry: true },
  });
  const journals = await prisma.journalEntry.findMany({
    where: { sourceType: "EXPENSE", sourceId: { in: expenses.map((item) => item.id) } },
    include: { lines: true },
  });
  await assertExpenseCategoryAccess(
    currentUser.role,
    expenses.map((item) => item.categoryId).filter((categoryId): categoryId is string => Boolean(categoryId)),
    returnPath,
  );
  await prisma.$transaction(async (tx) => {
    for (const item of expenses) {
      await tx.journalEntry.updateMany({ where: { sourceType: "EXPENSE", sourceId: item.id, deletedAt: null }, data: { deletedAt: new Date() } });
      await tx.cashTransaction.updateMany({ where: { expenseId: item.id, deletedAt: null }, data: { deletedAt: new Date() } });
      await tx.expense.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
    }
  });
  const after = await prisma.expense.findMany({
    where: { id: { in: expenses.map((item) => item.id) } },
    include: { cashEntry: true },
  });
  const journalsAfter = await prisma.journalEntry.findMany({
    where: { sourceType: "EXPENSE", sourceId: { in: expenses.map((item) => item.id) } },
    include: { lines: true },
  });
  await logActivity(currentUser, "DELETE", "ExpenseReceipt", expense.receiptNo ?? id, {
    expenses,
    journals,
  }, {
    expenses: after,
    journals: journalsAfter,
  });
  redirectWithNotice(returnPath, "Nota dan semua item pengeluaran terkait berhasil dihapus.");
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
  const created = await prisma.$transaction(async (tx) => {
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
    const journal = await tx.journalEntry.create({
      data: {
        number: `JU-${Date.now()}`,
        date: parsed.date,
        description: parsed.description,
        sourceType: "CASH",
        sourceId: cash.id,
        postedBy: user.name,
        lines: { create: lines },
      },
      include: { lines: true },
    });
    return { cash, journal };
  });
  await logActivity(user, "CREATE", "CashTransaction", created.cash.id, null, created);
  redirectWithNotice("/buku-kas", "Transaksi kas dan jurnal berhasil disimpan.");
}

export async function updateCashTransaction(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.CASHBOOK_MANAGE);
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
  const journalBefore = await prisma.journalEntry.findFirst({
    where: { sourceType: "CASH", sourceId: id },
    include: { lines: true },
  });
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
  const after = await prisma.cashTransaction.findUniqueOrThrow({ where: { id } });
  const journalAfter = await prisma.journalEntry.findFirst({
    where: { sourceType: "CASH", sourceId: id },
    include: { lines: true },
  });
  await logActivity(currentUser, "UPDATE", "CashTransaction", id, {
    cash: current,
    journal: journalBefore,
  }, {
    cash: after,
    journal: journalAfter,
  });
  redirectWithNotice("/buku-kas", "Transaksi kas berhasil diubah.");
}

export async function deleteCashTransaction(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.CASHBOOK_MANAGE);
  const id = getText(formData, "id");
  const current = await prisma.cashTransaction.findUniqueOrThrow({ where: { id } });
  const journalBefore = await prisma.journalEntry.findFirst({
    where: { sourceType: "CASH", sourceId: id },
    include: { lines: true },
  });
  if (current.paymentId || current.expenseId) {
    redirectWithNotice("/buku-kas", "Transaksi otomatis harus dihapus dari menu sumbernya.", "error");
  }
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.updateMany({ where: { sourceType: "CASH", sourceId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.cashTransaction.update({ where: { id }, data: { deletedAt: new Date() } });
  });
  const after = await prisma.cashTransaction.findUniqueOrThrow({ where: { id } });
  const journalAfter = await prisma.journalEntry.findFirst({
    where: { sourceType: "CASH", sourceId: id },
    include: { lines: true },
  });
  await logActivity(currentUser, "DELETE", "CashTransaction", id, {
    cash: current,
    journal: journalBefore,
  }, {
    cash: after,
    journal: journalAfter,
  });
  redirectWithNotice("/buku-kas", "Transaksi kas berhasil dihapus.");
}

export async function createAccount(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.ACCOUNTING_MANAGE);
  const parsed = parseWithNotice(accountSchema, {
    code: getText(formData, "code"),
    name: getText(formData, "name"),
    type: getText(formData, "type"),
  }, "/akuntansi?sheet=daftar-akun");
  const existing = await prisma.account.findUnique({ where: { code: parsed.code } });
  if (existing && !existing.deletedAt) {
    redirectWithNotice("/akuntansi?sheet=daftar-akun", "Kode akun sudah digunakan.", "error");
  }
  let saved;
  if (existing) {
    saved = await prisma.account.update({
      where: { id: existing.id },
      data: { ...parsed, active: true, deletedAt: null },
    });
  } else {
    saved = await prisma.account.create({ data: parsed });
  }
  await logActivity(currentUser, existing ? "RESTORE" : "CREATE", "Account", saved.id, existing, saved);
  redirectWithNotice("/akuntansi?sheet=daftar-akun", "Akun berhasil ditambahkan.");
}

export async function updateAccount(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.ACCOUNTING_MANAGE);
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
  const after = await prisma.account.update({
    where: { id },
    data: { ...parsed, active: nextActive },
  });
  await logActivity(currentUser, "UPDATE", "Account", id, current, after);
  redirectWithNotice("/akuntansi?sheet=daftar-akun", "Akun berhasil diubah.");
}

export async function deleteAccount(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.ACCOUNTING_MANAGE);
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
  const after = await prisma.account.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
  await logActivity(currentUser, "DELETE", "Account", id, account, after);
  redirectWithNotice("/akuntansi?sheet=daftar-akun", "Akun berhasil dihapus.");
}

export async function createJournalEntry(formData: FormData) {
  const user = await assertPermission(PermissionKey.ACCOUNTING_MANAGE);
  if (!["ADMIN", "SUPERADMIN"].includes(user.role)) {
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
  const journal = await prisma.journalEntry.create({
    data: {
      number: `JU-${Date.now()}`,
      date: parsed.date,
      description: parsed.description,
      sourceType: "MANUAL",
      postedBy: user.name,
      lines: { create: lines },
    },
    include: { lines: true },
  });
  await logActivity(user, "CREATE", "JournalEntry", journal.id, null, journal);
  redirectWithNotice("/akuntansi?sheet=jurnal", "Jurnal umum berhasil diposting.");
}

export async function deleteJournalEntry(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.ACCOUNTING_MANAGE);
  const id = getText(formData, "id");
  const journal = await prisma.journalEntry.findUniqueOrThrow({ where: { id }, include: { lines: true } });
  if (journal.sourceType && journal.sourceType !== "MANUAL") {
    redirectWithNotice("/akuntansi", "Jurnal otomatis harus dihapus dari transaksi sumber.", "error");
  }
  const after = await prisma.journalEntry.update({ where: { id }, data: { deletedAt: new Date() }, include: { lines: true } });
  await logActivity(currentUser, "DELETE", "JournalEntry", id, journal, after);
  redirectWithNotice("/akuntansi", "Jurnal manual berhasil dihapus.");
}

export async function saveReceiptSetting(formData: FormData) {
  const currentUser = await assertPermission(PermissionKey.RECEIPT_SETTING);
  const before = await prisma.receiptSetting.findUnique({ where: { id: "default" } });
  const uploadedLogo = getFile(formData, "logoFile");
  const removeLogo = getText(formData, "removeLogo") === "on";
  const logoUrl = uploadedLogo
    ? await saveReceiptLogo(uploadedLogo)
    : removeLogo
      ? null
      : before?.logoUrl ?? null;
  const parsed = parseWithNotice(receiptSettingSchema, {
    schoolName: getText(formData, "schoolName"),
    schoolAddress: getText(formData, "schoolAddress"),
    schoolPhone: getText(formData, "schoolPhone"),
    headerText: getText(formData, "headerText"),
    footerText: getText(formData, "footerText"),
    signatureName: getText(formData, "signatureName"),
    signatureTitle: getText(formData, "signatureTitle"),
  }, "/pengaturan/kwitansi");
  const after = await prisma.receiptSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      ...parsed,
      logoUrl,
    },
    update: {
      ...parsed,
      logoUrl,
    },
  });
  if ((uploadedLogo || removeLogo) && before?.logoUrl && before.logoUrl !== logoUrl) {
    await deleteReceiptLogo(before.logoUrl);
  }
  await logActivity(currentUser, before ? "UPDATE" : "CREATE", "ReceiptSetting", "default", before, after);
  revalidatePath("/pengaturan/kwitansi");
  revalidatePath("/kwitansi/[id]", "page");
  redirectWithNotice("/pengaturan/kwitansi", "Format header dan footer kwitansi berhasil disimpan.");
}
