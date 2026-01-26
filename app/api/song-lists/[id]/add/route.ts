export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type Params = {
  params: { id: string };
};

export async function POST(req: Request, { params }: Params) {
  try {
    const listId = params.id;

    if (!listId) {
      return NextResponse.json(
        { success: false, error: "ID da lista não informado" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    const songId = body?.songId;

    if (!songId || typeof songId !== "string") {
      return NextResponse.json(
        { success: false, error: "songId é obrigatório" },
        { status: 400 }
      );
    }

    // garante que lista existe
    const list = await prisma.songList.findUnique({
      where: { id: listId },
      select: { id: true },
    });

    if (!list) {
      return NextResponse.json(
        { success: false, error: "Lista não encontrada" },
        { status: 404 }
      );
    }

    // evita duplicar
    const existing = await prisma.songListItem.findFirst({
      where: { listId, songId },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        data: { alreadyExists: true },
      });
    }

    // coloca no final (maior order + 1)
    const last = await prisma.songListItem.findFirst({
      where: { listId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const nextOrder = (last?.order ?? -1) + 1;

    const created = await prisma.songListItem.create({
      data: {
        listId,
        songId,
        order: nextOrder,
      },
      select: { id: true, order: true, listId: true, songId: true },
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    console.error("Error adding song to list:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao adicionar música na lista" },
      { status: 500 }
    );
  }
}