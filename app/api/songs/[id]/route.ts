export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type Params = {
  params: {
    id: string;
  };
};

type ChordToken = { chord: string; pos: number };
type SongLine = { lyric: string; chords: ChordToken[] };
type SongPart = { type: string; title?: string | null; lines: SongLine[] };

function extractChordsUsed(parts: SongPart[]) {
  const set = new Set<string>();

  for (const part of parts ?? []) {
    for (const line of part.lines ?? []) {
      for (const token of line.chords ?? []) {
        const c = String(token?.chord ?? "").trim();
        if (c) set.add(c);
      }
    }
  }

  return Array.from(set);
}

function buildSearchIndex(title: string, artist: string | null | undefined, parts: SongPart[]) {
  const lyrics: string[] = [];

  for (const part of parts ?? []) {
    for (const line of part.lines ?? []) {
      const text = String(line?.lyric ?? "").trimEnd();
      if (text) lyrics.push(text);
    }
  }

  return [title ?? "", artist ?? "", ...lyrics].join("\n").toLowerCase();
}

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
        rawText: song.rawText,
        content: song.content,
        chordsUsed: song.chordsUsed,
        searchIndex: song.searchIndex,
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

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Body JSON inválido" },
        { status: 400 }
      );
    }

    // Aceitamos:
    // { content: { parts: [...] } }
    // ou { parts: [...] }
    const parts = body?.content?.parts ?? body?.parts;

    if (!Array.isArray(parts)) {
      return NextResponse.json(
        {
          success: false,
          error: "Envie 'content.parts' (array) ou 'parts' (array)",
        },
        { status: 400 }
      );
    }

    // buscamos o song atual (pra usar title/artist no searchIndex)
    const current = await prisma.song.findUnique({ where: { id } });

    if (!current) {
      return NextResponse.json(
        { success: false, error: "Cifra não encontrada" },
        { status: 404 }
      );
    }

    const chordsUsed = extractChordsUsed(parts as SongPart[]);
    const searchIndex = buildSearchIndex(
      current.title,
      current.artist,
      parts as SongPart[]
    );

    const updated = await prisma.song.update({
      where: { id },
      data: {
        content: { parts } as any,
        chordsUsed,
        searchIndex,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        title: updated.title,
        artist: updated.artist,
        originalKey: updated.originalKey,
        tags: updated.tags,
        rawText: updated.rawText,
        content: updated.content,
        chordsUsed: updated.chordsUsed,
        searchIndex: updated.searchIndex,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error saving song (PATCH):", error);
    return NextResponse.json(
      { success: false, error: "Erro ao salvar cifra" },
      { status: 500 }
    );
  }
}