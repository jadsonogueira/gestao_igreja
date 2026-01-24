export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const members = await prisma.member.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        email: true,
      },
    });

    return NextResponse.json({ ok: true, items: members });
  } catch (e: any) {
    console.error("GET /api/members/options error:", e);
    return NextResponse.json(
      { ok: false, error: "Falha ao carregar membros", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
