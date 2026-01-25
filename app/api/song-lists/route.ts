export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const lists = await prisma.songList.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: lists });
  } catch (error) {
    console.error("GET /api/song-lists error:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao listar listas" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const name = String(body?.name ?? "").trim();

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Nome da lista é obrigatório" },
        { status: 400 }
      );
    }

    const created = await prisma.songList.create({
      data: { name },
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    // unique violation no Prisma costuma virar erro com code P2002
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Já existe uma lista com esse nome" },
        { status: 409 }
      );
    }

    console.error("POST /api/song-lists error:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao criar lista" },
      { status: 500 }
    );
  }
}