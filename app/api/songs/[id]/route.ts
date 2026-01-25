export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type Params = {
  params: { id: string };
};

type SongChordToken = { chord: string; pos: number };
type SongLine = { lyric: string; chords: SongChordToken[] };
type SongPart = { type: string; title?: string | null; lines: SongLine[] };

function safeString(v: any) {
  return String(v ?? "").trim();
}

function extractFirstChord(parts: SongPart[]): string | null {
  for (const p of parts ?? []) {
    for (const l of p.lines ?? []) {
      for (const c of l.chords ?? []) {
        const chord = safeString(c?.chord);
        if (chord) return chord;
      }
    }
  }
  return null;
}

function chordRootToKey(chord: string): string | null {
  const m = safeString(chord).match(/^([A-Ga-g])([#b]?)/);
  if (!m) return null;
  const root = m[1].toUpperCase();
  const acc = m[2] ?? "";
  return `${root}${acc}`;
}

function extractChordsUsed(parts: SongPart[]): string[] {
  const set = new Set<string>();
  for (const p of parts ?? []) {
    for (const l of p.lines ?? []) {
      for (const c of l.chords ?? []) {
        const chord = safeString(c?.chord);
        if (chord) set.add(chord);
      }
    }
  }
  return Array.from(set);
}

function buildSearchIndex(title: string, artist: string | null, parts: SongPart[]): string {
  const lyrics: string[] = [];
  for (const p of parts ?? []) {
    for (const l of p.lines ?? []) {
      const t = safeString(l?.lyric);
      if (t) lyrics.push(t);
    }
  }
  return [title, artist ?? "", lyrics.join(" ")].join(" ").toLowerCase();
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

    const song = await prisma.song.findUnique({ where: { id } });

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

    const content = body?.content;
    const tags = Array.isArray(body?.tags) ? body.tags.map((t: any) => safeString(t)).filter(Boolean) : undefined;

    const parts: SongPart[] = content?.parts ?? [];

    // ✅ detecta tom pela cifra (primeiro acorde encontrado)
    const firstChord = extractFirstChord(parts);
    const inferredKey = firstChord ? chordRootToKey(firstChord) : null;

    const current = await prisma.song.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json(
        { success: false, error: "Cifra não encontrada" },
        { status: 404 }
      );
    }

    // ✅ se não inferiu, mantém o originalKey atual
    const nextOriginalKey = inferredKey ?? current.originalKey;

    const chordsUsed = extractChordsUsed(parts);
    const searchIndex = buildSearchIndex(current.title, current.artist, parts);

    const updated = await prisma.song.update({
      where: { id },
      data: {
        content,
        tags: tags ?? current.tags,
        originalKey: nextOriginalKey,
        chordsUsed,
        searchIndex,
      },
      select: {
        id: true,
        title: true,
        artist: true,
        originalKey: true,
        tags: true,
        content: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error saving song:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao salvar cifra" },
      { status: 500 }
    );
  }
}