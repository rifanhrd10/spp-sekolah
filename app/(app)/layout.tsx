import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { getRolePermissions } from "@/lib/permissions";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const permissions = await getRolePermissions(user.role);
  return <AppShell user={user} permissions={permissions}>{children}</AppShell>;
}
