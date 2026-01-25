export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const id = params.id;

    const list = await prisma.songList.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
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

    return NextResponse.json({ success: true, data: list });
  } catch (error) {
    console.error("GET /api/song-lists/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao buscar lista" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const id = params.id;
    const body = await req.json().catch(() => null);
    const name = String(body?.name ?? "").trim().replace(/\s+/g, " ");

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Nome é obrigatório" },
        { status: 400 }
      );
    }

    const updated = await prisma.songList.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, updatedAt: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Já existe uma lista com esse nome" },
        { status: 409 }
      );
    }

    console.error("PATCH /api/song-lists/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao renomear lista" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const id = params.id;

    await prisma.songList.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/song-lists/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao excluir lista" },
      { status: 500 }
    );
  }
}