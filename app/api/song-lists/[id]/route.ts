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
      { success: false, error: "Erro ao carregar lista" },
      { status: 500 }
    );
  }
}