import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { getAllowedExpenseCategoryIds, getRolePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [permissions, allowedExpenseCategoryIds] = await Promise.all([
    getRolePermissions(user.role),
    getAllowedExpenseCategoryIds(user.role),
  ]);
  const [expenseCategories, role] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: {
        active: true,
        deletedAt: null,
        ...(allowedExpenseCategoryIds === null ? {} : { id: { in: allowedExpenseCategoryIds } }),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.role.findUnique({
      where: { code: user.role },
      select: { name: true },
    }),
  ]);
  return <AppShell expenseCategories={expenseCategories} user={{ ...user, roleName: role?.name ?? user.role }} permissions={permissions}>{children}</AppShell>;
}
