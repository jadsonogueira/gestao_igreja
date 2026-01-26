// app/api/song-lists/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const songId = searchParams.get("songId");

    // ✅ Caso 1: listar listas simples
    if (!songId) {
      const lists = await prisma.songList.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
        },
      });

      return NextResponse.json({ success: true, data: lists });
    }

    // ✅ Caso 2: listar listas marcando se a música já está dentro
    // Pega todas as listas e inclui SOMENTE o item que bate com songId (se existir).
    const lists = await prisma.songList.findMany({
      orderBy: { name: "asc" },
      include: {
        items: {
          where: { songId },
          select: { id: true }, // itemId
          take: 1,
        },
      },
    });

    const data = lists.map((l) => ({
      id: l.id,
      name: l.name,
      inList: (l.items?.length ?? 0) > 0,
      itemId: l.items?.[0]?.id ?? null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error listing song lists:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao listar listas" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const nameRaw = typeof body?.name === "string" ? body.name : "";
    const name = nameRaw.trim().replace(/\s+/g, " ");

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Nome da lista é obrigatório" },
        { status: 400 }
      );
    }

    // evita erro feio de unique (melhor mensagem)
    const existing = await prisma.songList.findFirst({
      where: { name },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Já existe uma lista com esse nome" },
        { status: 409 }
      );
    }

    const created = await prisma.songList.create({
      data: { name },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    console.error("Error creating song list:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao criar lista" },
      { status: 500 }
    );
  }
}