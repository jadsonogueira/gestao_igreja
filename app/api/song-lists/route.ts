export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const songId = String(searchParams.get("songId") ?? "").trim();

    // 🔹 Sem songId: comportamento antigo (lista simples)
    if (!songId) {
      const lists = await prisma.songList.findMany({
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ success: true, data: lists });
    }

    // 🔹 Com songId: retorna as listas marcando se a música já está nelas
    const lists = await prisma.songList.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          where: { songId },
          select: { id: true }, // existe? então está na lista
          take: 1,
        },
      },
    });

    const mapped = lists.map((l) => ({
      id: l.id,
      name: l.name,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      inList: (l.items?.length ?? 0) > 0,
      itemId: l.items?.[0]?.id ?? null,
    }));

    return NextResponse.json({ success: true, data: mapped });
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