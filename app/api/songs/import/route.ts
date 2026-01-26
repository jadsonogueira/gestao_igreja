export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { buildSearchIndex, parseSongFromChordAboveText } from "@/lib/songImport";

type ImportSongBody = {
  title?: string;
  artist?: string | null;
  originalKey?: string; // opcional
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

/**
 * Remove “lixo” comum do Cifra Club e normaliza linhas:
 * - remove cabeçalhos e metadados (Tom:, Capotraste, etc.)
 * - troca TAB por espaços
 * - normaliza múltiplos espaços
 * - remove excesso de linhas vazias
 */
function cleanRawSongText(raw: string) {
  const lines = String(raw ?? "")
    .replace(/\r/g, "")
    .replace(/\t/g, "  ")
    .split("\n");

  const dropLine = (t: string) => {
    const s = t.trim();
    if (!s) return false;

    // cabeçalhos comuns / metadados
    if (/^cifra\s+club\b/i.test(s)) return true;
    if (/^composi(c|ç)(a|ã)o\b/i.test(s)) return true;
    if (/^tom\s*:/i.test(s)) return true; // mantemos o tom para detecção, mas removemos do corpo
    if (/^key\s*:/i.test(s)) return true;
    if (/^capotraste\b/i.test(s)) return true;
    if (/^afina(c|ç)(a|ã)o\b/i.test(s)) return true;
    if (/^tempo\b/i.test(s)) return true;
    if (/^ritmo\b/i.test(s)) return true;
    if (/^vers(a|ã)o\b/i.test(s)) return true;
    if (/^(\d+)\s*x\s*$/i.test(s)) return true; // "2x" sozinho

    // linhas “decorativas”
    if (/^[\-\—\–\=\_]{3,}$/.test(s)) return true;

    // links / créditos
    if (/^https?:\/\//i.test(s)) return true;

    return false;
  };

  const cleaned: string[] = [];
  for (const line of lines) {
    const normalized = line.replace(/\s+$/g, ""); // trimEnd
    if (dropLine(normalized)) continue;

    // normaliza múltiplos espaços, mas mantém alinhamento de cifras:
    // aqui usamos um meio-termo: reduz 4+ espaços para 3 (evita “explodir” no mobile)
    const soft = normalized.replace(/ {4,}/g, "   ");

    cleaned.push(soft);
  }

  // remove excesso de linhas vazias (no máximo 1 em sequência)
  const finalLines: string[] = [];
  let lastWasEmpty = false;

  for (const line of cleaned) {
    const isEmpty = !line.trim();
    if (isEmpty) {
      if (lastWasEmpty) continue;
      lastWasEmpty = true;
      finalLines.push("");
      continue;
    }
    lastWasEmpty = false;
    finalLines.push(line);
  }

  return finalLines.join("\n").trim();
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

  // pega só a raiz: C, C#, Db, etc
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
    .slice(0, 35); // geralmente no topo

  for (const line of lines) {
    // Tom: D / Key: C
    let m = line.match(/^(tom|key)\s*:\s*(.+)$/i);
    if (m) {
      const candidate = normalizeKey(m[2]);
      if (candidate) return candidate;
    }

    // Tom D / Key C (sem :)
    m = line.match(/^(tom|key)\s+(.+)$/i);
    if (m) {
      const candidate = normalizeKey(m[2]);
      if (candidate) return candidate;
    }

    // "Capotraste: 2 (Tom: C)" -> extrai o Tom dentro
    m = line.match(/\b(tom|key)\s*:\s*([A-G](?:#|b)?|dó|do|ré|re|mi|fá|fa|sol|lá|la|si)\b/i);
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
    const rawTextInput = String(body.rawText ?? "");
    const tags = normalizeTags(body.tags);

    if (!title) {
      return NextResponse.json(
        { success: false, error: "Título é obrigatório" },
        { status: 400 }
      );
    }

    if (!rawTextInput.trim()) {
      return NextResponse.json(
        { success: false, error: "Cole a cifra no campo de texto" },
        { status: 400 }
      );
    }

    // ✅ detectar tom do TEXTO ORIGINAL (antes de limpar),
    // porque a limpeza remove "Tom:" etc.
    const providedKey = String(body.originalKey ?? "").trim();
    const detectedKey = detectKeyFromRawText(rawTextInput);

    const originalKeyUsed = providedKey || detectedKey || "C";

    // ✅ limpar texto antes de parsear
    const rawTextClean = cleanRawSongText(rawTextInput);

    const { content, chordsUsed } = parseSongFromChordAboveText(rawTextClean);
    const searchIndex = buildSearchIndex({ title, artist, content });

    const song = await prisma.song.create({
      data: {
        title,
        artist,
        originalKey: originalKeyUsed,
        rawText: rawTextClean, // salva já limpo (melhor pro futuro)
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