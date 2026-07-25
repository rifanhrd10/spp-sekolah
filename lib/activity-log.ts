import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ActivityActor = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

type ActivityPayload = {
  action: string;
  entity: string;
  entityId?: string | null;
  user?: ActivityActor | null;
  before?: unknown;
  after?: unknown;
};

const hiddenKeys = new Set(["password", "passwordHash"]);

function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return String(value);
  if (typeof value !== "object") return value as Prisma.InputJsonValue;
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item) ?? null) as Prisma.InputJsonValue;
  }

  const result: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (hiddenKeys.has(key)) {
      result[key] = "[disembunyikan]";
      continue;
    }
    const sanitized = sanitize(nestedValue);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result as Prisma.InputJsonValue;
}

export async function writeActivityLog({
  action,
  after,
  before,
  entity,
  entityId,
  user,
}: ActivityPayload) {
  try {
    await prisma.activityLog.create({
      data: {
        action,
        entity,
        entityId,
        userId: user?.id ?? null,
        userName: user?.name ?? null,
        userEmail: user?.email ?? null,
        userRole: user?.role ?? null,
        before: sanitize(before) ?? undefined,
        after: sanitize(after) ?? undefined,
      },
    });
  } catch (error) {
    console.error("Gagal menulis log aktivitas", error);
  }
}

export function isSuperAdmin(user: { role: string } | null | undefined) {
  return user?.role === "SUPERADMIN";
}
