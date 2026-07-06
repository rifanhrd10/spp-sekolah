import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRolePermissions } from "@/lib/permissions";
import type { PermissionKey } from "@prisma/client";

const cookieName = "spp_session";
const maxAge = 60 * 60 * 8;

function secret() {
  return process.env.AUTH_SECRET || "spp-sekolah-dev-secret";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function createSession(userId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + maxAge;
  const payload = `${userId}.${expiresAt}`;
  const token = `${payload}.${sign(payload)}`;
  const cookieStore = await cookies();

  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
    path: "/",
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) return null;

  const [userId, expiresText, signature] = token.split(".");
  if (!userId || !expiresText || !signature) return null;

  const payload = `${userId}.${expiresText}`;
  const expired = Number(expiresText) < Math.floor(Date.now() / 1000);

  if (expired || !safeEqual(signature, sign(payload))) {
    return null;
  }

  return prisma.user.findFirst({
    where: { id: userId, active: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requirePermission(permission: PermissionKey) {
  const user = await requireUser();
  const permissions = await getRolePermissions(user.role);

  if (!permissions.includes(permission)) {
    redirect("/dashboard?notice=Akses Anda untuk fitur tersebut tidak tersedia.&noticeType=error");
  }

  return { ...user, permissions };
}
