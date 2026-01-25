export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(_request: Request, { params }: Params) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID da cifra não informado" },
        { status: 400 }
      );
    }

    const song = await prisma.song.findUnique({
      where: { id },
    });

    if (!song) {
      return NextResponse.json(
        { success: false, error: "Cifra não encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: song.id,
        title: song.title,
        artist: song.artist,
        originalKey: song.originalKey,
        tags: song.tags,
        content: song.content,
        createdAt: song.createdAt,
        updatedAt: song.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching song detail:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao buscar cifra" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID da cifra não informado" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Body inválido" },
        { status: 400 }
      );
    }

    const dataToUpdate: any = {};

    // ✅ content (opcional)
    if (body.content) {
      const content = body.content;

      if (!content || typeof content !== "object") {
        return NextResponse.json(
          { success: false, error: "Campo 'content' inválido" },
          { status: 400 }
        );
      }

      const parts = (content as any)?.parts;
      if (!Array.isArray(parts)) {
        return NextResponse.json(
          { success: false, error: "content.parts precisa ser um array" },
          { status: 400 }
        );
      }

      dataToUpdate.content = content;
    }

    // ✅ originalKey (opcional)
    if (typeof (body as any).originalKey === "string") {
      const originalKey = (body as any).originalKey.trim().toUpperCase();

      const allowed = new Set(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
      if (!allowed.has(originalKey)) {
        return NextResponse.json(
          { success: false, error: "Tom original inválido" },
          { status: 400 }
        );
      }

      dataToUpdate.originalKey = originalKey;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json(
        { success: false, error: "Nada para atualizar" },
        { status: 400 }
      );
    }

    const updated = await prisma.song.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        title: true,
        artist: true,
        originalKey: true,
        tags: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating song:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao salvar cifra" },
      { status: 500 }
    );
  }
}