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

    await prisma.songListItem.delete({
      where: {
        listId_songId: { listId, songId },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    // se não existe, responde ok (idempotente)
    if (error?.code === "P2025") {
      return NextResponse.json({ success: true, data: { missing: true } });
    }

    console.error("POST /api/song-lists/[id]/remove error:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao remover cifra da lista" },
      { status: 500 }
    );
  }
}