import { PermissionKey, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const permissionLabels: Record<PermissionKey, string> = {
  DASHBOARD_VIEW: "Melihat dashboard",
  MASTER_STUDENT: "Mengelola data siswa",
  MASTER_CLASS: "Mengelola data kelas",
  MASTER_PAYMENT: "Mengelola jenis pembayaran",
  MASTER_EXPENSE_CATEGORY: "Mengelola kategori pengeluaran",
  USER_MANAGE: "Mengelola pengguna",
  ROLE_MANAGE: "Mengatur hak akses role",
  INVOICE_MANAGE: "Mengelola tagihan",
  PAYMENT_MANAGE: "Mencatat pembayaran",
  EXPENSE_MANAGE: "Mengelola pengeluaran",
  CASHBOOK_VIEW: "Melihat buku kas",
  CASHBOOK_MANAGE: "Mencatat buku kas manual",
  ACCOUNTING_VIEW: "Melihat akuntansi",
  ACCOUNTING_MANAGE: "Mengelola akun dan jurnal",
  REPORT_VIEW: "Melihat laporan",
  ANALYTICS_VIEW: "Melihat analisa keuangan",
  RECEIPT_SETTING: "Mengatur format kwitansi",
};

export const defaultPermissions: Record<UserRole, PermissionKey[]> = {
  ADMIN: Object.values(PermissionKey),
  BENDAHARA: [
    PermissionKey.DASHBOARD_VIEW,
    PermissionKey.MASTER_STUDENT,
    PermissionKey.MASTER_CLASS,
    PermissionKey.MASTER_PAYMENT,
    PermissionKey.MASTER_EXPENSE_CATEGORY,
    PermissionKey.INVOICE_MANAGE,
    PermissionKey.PAYMENT_MANAGE,
    PermissionKey.EXPENSE_MANAGE,
    PermissionKey.CASHBOOK_VIEW,
    PermissionKey.CASHBOOK_MANAGE,
    PermissionKey.ACCOUNTING_VIEW,
    PermissionKey.ACCOUNTING_MANAGE,
    PermissionKey.REPORT_VIEW,
    PermissionKey.ANALYTICS_VIEW,
    PermissionKey.RECEIPT_SETTING,
  ],
  KEPALA_SEKOLAH: [
    PermissionKey.DASHBOARD_VIEW,
    PermissionKey.CASHBOOK_VIEW,
    PermissionKey.ACCOUNTING_VIEW,
    PermissionKey.REPORT_VIEW,
    PermissionKey.ANALYTICS_VIEW,
  ],
};

export async function getRolePermissions(role: UserRole) {
  const configured = await prisma.rolePermission.findMany({
    where: { role },
    select: { allowed: true, permission: true },
  });

  return configured.length
    ? configured.filter((item) => item.allowed).map((item) => item.permission)
    : defaultPermissions[role];
}

export async function hasPermission(role: UserRole, permission: PermissionKey) {
  const permissions = await getRolePermissions(role);
  return permissions.includes(permission);
}
