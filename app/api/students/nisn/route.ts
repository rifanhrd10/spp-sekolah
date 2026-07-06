import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  await requireUser();
  const nisn = request.nextUrl.searchParams.get("nisn")?.trim() ?? "";
  const excludeId = request.nextUrl.searchParams.get("excludeId")?.trim() || undefined;

  if (!/^\d{4,20}$/.test(nisn)) {
    return NextResponse.json({ available: false });
  }

  const existing = await prisma.student.findFirst({
    where: {
      nisn,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });

  return NextResponse.json({ available: !existing });
}
