export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server"; // ✅ FALTAVA ISSO
import prisma from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (key !== process.env.ADMIN_CLEAR_KEY) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const result = await prisma.emailLog.deleteMany({
    where: { status: "pendente" },
  });

  return NextResponse.json({
    success: true,
    deleted: result.count,
  });
}