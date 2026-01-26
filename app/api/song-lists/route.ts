export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const songId = searchParams.get("songId");

    // lista todas as listas
    const lists = await prisma.songList.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    // sem songId: retorna simples
    if (!songId) {
      return NextResponse.json({ success: true, data: lists });
    }

    // com songId: marca quais listas já tem a música
    const items = await prisma.songListItem.findMany({
      where: { songId },
      select: { id: true, listId: true },
    });

    const map = new Map<string, { itemId: string }>();
    for (const it of items) map.set(it.listId, { itemId: it.id });

    const enriched = lists.map((l) => {
      const hit = map.get(l.id);
      return {
        ...l,
        inList: !!hit,
        itemId: hit?.itemId ?? null,
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error("Error listing song lists:", error);
    return jsonError("Erro ao listar listas", 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";

    if (!name) return jsonError("name é obrigatório", 400);

    // cria
    const created = await prisma.songList.create({
      data: { name },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    // nome único
    const msg = String(error?.message ?? "");
    if (msg.toLowerCase().includes("unique")) {
      return jsonError("Já existe uma lista com esse nome", 409);
    }

    console.error("Error creating song list:", error);
    return jsonError("Erro ao criar lista", 500);
  }
}