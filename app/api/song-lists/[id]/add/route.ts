export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const listId = params.id;
    const body = await req.json().catch(() => null);
    const songId = String(body?.songId ?? "").trim();

    if (!songId) {
      return NextResponse.json(
        { success: false, error: "songId é obrigatório" },
        { status: 400 }
      );
    }

    await prisma.songListItem.create({
      data: { listId, songId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    // Já existe na lista (unique listId+songId)
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: true, data: { already: true } } // idempotente
      );
    }

    console.error("POST /api/song-lists/[id]/add error:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao adicionar cifra na lista" },
      { status: 500 }
    );
  }
}