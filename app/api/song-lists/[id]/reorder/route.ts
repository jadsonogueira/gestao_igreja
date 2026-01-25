export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const listId = params.id;
    const body = await req.json().catch(() => null);

    const itemId = String(body?.itemId ?? "").trim();
    const direction = String(body?.direction ?? "").trim(); // "up" | "down"

    if (!itemId || (direction !== "up" && direction !== "down")) {
      return NextResponse.json(
        { success: false, error: "Envie itemId e direction (up|down)" },
        { status: 400 }
      );
    }

    // pega todos os itens da lista em ordem
    const items = await prisma.songListItem.findMany({
      where: { listId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, order: true },
    });

    const idx = items.findIndex((x) => x.id === itemId);
    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: "Item não encontrado na lista" },
        { status: 404 }
      );
    }

    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= items.length) {
      return NextResponse.json({ success: true, data: { unchanged: true } });
    }

    const a = items[idx];
    const b = items[swapWith];

    // swap dos "order" (garante persistência)
    await prisma.$transaction([
      prisma.songListItem.update({
        where: { id: a.id },
        data: { order: b.order },
      }),
      prisma.songListItem.update({
        where: { id: b.id },
        data: { order: a.order },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/song-lists/[id]/reorder error:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao reordenar" },
      { status: 500 }
    );
  }
}