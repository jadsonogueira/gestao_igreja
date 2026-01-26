export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { buildSearchIndex, parseSongFromChordAboveText } from "@/lib/songImport";

type ImportSongBody = {
  title?: string;
  artist?: string | null;
  originalKey?: string; // agora opcional
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

const KEY_ALIASES: Record<string, string> = {
  // PT-BR
  do: "C",
  "dó": "C",
  re: "D",
  "ré": "D",
  mi: "E",
  fa: "F",
  "fá": "F",
  sol: "G",
  la: "A",
  "lá": "A",
  si: "B",
};

function normalizeKey(raw: string): string | null {
  const s = raw.trim();

  // aceita: C, C#, Db, Dm, C#m (aqui queremos só a raiz: C, C#, Db...)
  // vamos pegar só a nota + acidente (se tiver)
  const m = s.match(/^([A-Ga-g])\s*([#b])?/);
  if (m) {
    const note = m[1].toUpperCase();
    const acc = m[2] ? m[2] : "";
    return `${note}${acc}`;
  }

  const lower = s.toLowerCase();
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];

  return null;
}

function detectKeyFromRawText(rawText: string): string | null {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 25); // normalmente o "Tom:" vem no topo

  for (const line of lines) {
    // exemplos:
    // "Tom: D"
    // "Tom: Ré"
    // "Key: C"
    // "TOM: Bb"
    const m = line.match(/^(tom|key)\s*:\s*(.+)$/i);
    if (m) {
      const candidate = normalizeKey(m[2]);
      if (candidate) return candidate;
    }
  }

  return null;
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
          error: "Content-Type inválido. Use Content-Type: application/json",
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
    const rawText = String(body.rawText ?? "").trim();
    const tags = normalizeTags(body.tags);

    if (!title) {
      return NextResponse.json(
        { success: false, error: "Título é obrigatório" },
        { status: 400 }
      );
    }

    if (!rawText) {
      return NextResponse.json(
        { success: false, error: "Cole a cifra no campo de texto" },
        { status: 400 }
      );
    }

    // ✅ originalKey agora pode vir vazio; tentamos detectar
    const providedKey = String(body.originalKey ?? "").trim();
    const detectedKey = detectKeyFromRawText(rawText);

    const originalKeyUsed = providedKey || detectedKey || "C";

    const { content, chordsUsed } = parseSongFromChordAboveText(rawText);
    const searchIndex = buildSearchIndex({ title, artist, content });

    const song = await prisma.song.create({
      data: {
        title,
        artist,
        originalKey: originalKeyUsed,
        rawText,
        content: content as any,
        chordsUsed,
        searchIndex,
        tags,
      },
      select: { id: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: song.id,
        detectedKey: detectedKey || null,
        originalKeyUsed,
      },
    });
  } catch (error) {
    console.error("Error importing song:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao importar cifra" },
      { status: 500 }
    );
  }
}