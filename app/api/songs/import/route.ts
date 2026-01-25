export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { buildSearchIndex, parseSongFromChordAboveText } from "@/lib/songImport";

type ImportSongBody = {
  title?: string;
  artist?: string | null;
  originalKey?: string;
  rawText?: string;
  tags?: string[];
};

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((t) => String(t ?? "").trim())
    .filter(Boolean)
    .slice(0, 50);
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const contentLength = request.headers.get("content-length") ?? "unknown";

    // Se não for JSON, já responde 400
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Content-Type inválido. Use Content-Type: application/json",
          debug: { contentType, contentLength },
        },
        { status: 400 }
      );
    }

    let body: ImportSongBody;
    try {
      body = (await request.json()) as ImportSongBody;
    } catch (e) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Body JSON inválido ou vazio. Verifique se o app está enviando o body corretamente.",
          debug: { contentType, contentLength },
        },
        { status: 400 }
      );
    }

    const title = String(body.title ?? "").trim();
    const artist = body.artist ? String(body.artist).trim() : null;
    const originalKey = String(body.originalKey ?? "").trim();
    const rawText = String(body.rawText ?? "").trim();
    const tags = normalizeTags(body.tags);

    if (!title) {
      return NextResponse.json(
        { success: false, error: "Título é obrigatório" },
        { status: 400 }
      );
    }

    if (!originalKey) {
      return NextResponse.json(
        { success: false, error: "Tom original é obrigatório" },
        { status: 400 }
      );
    }

    if (!rawText) {
      return NextResponse.json(
        { success: false, error: "Cole a cifra no campo de texto" },
        { status: 400 }
      );
    }

    const { content, chordsUsed } = parseSongFromChordAboveText(rawText);
    const searchIndex = buildSearchIndex({ title, artist, content });

    const song = await prisma.song.create({
      data: {
        title,
        artist,
        originalKey,
        rawText,
        content: content as any,
        chordsUsed,
        searchIndex,
        tags,
      },
    });

    return NextResponse.json({
      success: true,
      data: { id: song.id },
    });
  } catch (error) {
    console.error("Error importing song:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao importar cifra" },
      { status: 500 }
    );
  }
}