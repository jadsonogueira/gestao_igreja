export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type Params = {
  params: { id: string };
};

function normKey(k?: string | null) {
  return String(k ?? "").trim().toUpperCase();
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID da lista não informado" },
        { status: 400 }
      );
    }

    const list = await prisma.songList.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { order: "asc" },
          include: {
            song: {
              select: {
                id: true,
                title: true,
                artist: true,
                originalKey: true,
                tags: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!list) {
      return NextResponse.json(
        { success: false, error: "Lista não encontrada" },
        { status: 404 }
      );
    }

    // ✅ garante o shape que o front usa
    const data = {
      id: list.id,
      name: list.name,
      items: (list.items ?? []).map((it) => ({
        id: it.id,
        order: it.order ?? 0,
        song: {
          id: it.song.id,
          title: it.song.title,
          artist: it.song.artist,
          originalKey: normKey(it.song.originalKey),
          tags: it.song.tags ?? [],
          updatedAt: it.song.updatedAt,
        },
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching song list:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao buscar lista" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID da lista não informado" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Body inválido" },
        { status: 400 }
      );
    }

    const nameRaw = typeof (body as any).name === "string" ? (body as any).name : "";
    const name = nameRaw.trim().replace(/\s+/g, " ");

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Nome inválido" },
        { status: 400 }
      );
    }

    const updated = await prisma.songList.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, updatedAt: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating song list:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao atualizar lista" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID da lista não informado" },
        { status: 400 }
      );
    }

    await prisma.songListItem.deleteMany({ where: { listId: id } });
    await prisma.songList.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting song list:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao excluir lista" },
      { status: 500 }
    );
  }
}