export type SongChordToken = {
  chord: string;
  /** posição (coluna) onde o acorde começa, baseado na linha de letra */
  pos: number;
};

export type SongLine = {
  lyric: string;
  chords: SongChordToken[];
};

export type SongPart = {
  type: string; // ex: INTRO, VERSO, REFRAO, PONTE...
  title?: string | null;
  lines: SongLine[];
};

export type SongContent = {
  parts: SongPart[];
};

function normalizeLine(line: string) {
  // mantém o texto, mas remove CR e troca TAB por 2 espaços
  return line.replace(/\r/g, "").replace(/\t/g, "  ");
}

const HEADING_MAP: Array<{ re: RegExp; type: string }> = [
  { re: /^(intro|introdu(c|ç)(a|ã)o)\b/i, type: "INTRO" },
  { re: /^(verso)\b/i, type: "VERSO" },
  { re: /^(refr(a|ã)o|coro)\b/i, type: "REFRAO" },
  { re: /^(pre\s*-?\s*refr(a|ã)o|pr(e|é)\s*-?\s*coro)\b/i, type: "PRE_REFRAO" },
  { re: /^(ponte)\b/i, type: "PONTE" },
  { re: /^(final|outro|tag)\b/i, type: "FINAL" },
  { re: /^(interl(ú|u)dio)\b/i, type: "INTERLUDIO" },
];

function stripBracketsHeading(line: string) {
  let t = line.trim();
  if (!t) return t;

  if (t.startsWith("[")) t = t.slice(1).trimStart();
  if (t.endsWith("]")) t = t.slice(0, -1).trimEnd();

  return t;
}

function parseHeading(line: string): { type: string; title?: string } | null {
  const raw = line.trim();
  if (!raw) return null;

  const t = stripBracketsHeading(raw);
  if (!t) return null;

  for (const h of HEADING_MAP) {
    if (h.re.test(t)) {
      return { type: h.type, title: raw };
    }
  }
  return null;
}

/**
 * Normaliza token de acorde para validação/consistência:
 * - ♯ -> #
 * - ♭ -> b
 * - traços “esquisitos” -> "-"
 * - remove espaços internos (ex: "E7( 5 - )" -> "E7(5-)")
 */
function normalizeChordToken(input: string) {
  return String(input ?? "")
    .trim()
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "");
}

/**
 * ✅ Regex de acorde (abrangente, porém segura)
 */
const CHORD_TOKEN_RE =
  /^[A-G](?:#|b)?(?:m(?!aj)|min|maj|M|Δ)?(?:sus2|sus4|sus|add\d+|dim|aug|\+|°|º|ø)?(?:\d{1,2}|7M|9M|11M|13M|maj\d+|M\d+)?(?:m\d+)?(?:\([0-9+#b,\-]+\))*(?:[#b]\d{1,2})*(?:\/(?:[A-G](?:#|b)?|\d{1,2}))?$/i;

function looksLikeChordToken(token: string) {
  const t0 = token.trim();
  if (!t0) return false;

  const t = normalizeChordToken(t0);

  if (t.length > 40) return false;

  if (!/^[A-G0-9a-zA-Z#b()\/+\-°ºøΔ,]+$/.test(t)) return false;

  return CHORD_TOKEN_RE.test(t);
}

/**
 * Linha de acordes "clássica": vários acordes separados por espaços,
 * ou 1 acorde + bastante espaçamento.
 */
function isChordLine(line: string) {
  const t = line.trim();
  if (!t) return false;

  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  const chordLike = tokens.filter(looksLikeChordToken).length;

  if (chordLike >= 2) return true;

  const spaces = (line.match(/\s/g) ?? []).length;
  if (chordLike === 1 && spaces >= 4) return true;

  return false;
}

/**
 * Linha com 1 acorde sozinho (ex.: "C" em uma linha)
 */
function isSingleChordOnlyLine(line: string) {
  const t = line.trim();
  if (!t) return false;

  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return false;

  return looksLikeChordToken(tokens[0]);
}

function nextLineLooksLikeLyric(next: string) {
  const t = next.trim();
  if (!t) return false;

  if (isChordLine(next) || isSingleChordOnlyLine(next)) return false;

  // precisa ter letras (inclui acentos) para ser lyric
  if (/[A-Za-zÀ-ÿ]/.test(t)) return true;

  if (/\s/.test(t) && t.length >= 3) return true;

  return true;
}

function extractChordsWithPositions(chordLine: string): SongChordToken[] {
  const out: SongChordToken[] = [];

  const re = /\S+/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(chordLine))) {
    const raw = m[0];
    if (!looksLikeChordToken(raw)) continue;

    const col = m.index;
    const pos = Math.max(0, col);

    out.push({ chord: normalizeChordToken(raw), pos });
  }

  const seen = new Set<string>();
  return out.filter((c) => {
    const key = `${c.pos}|${c.chord}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * ✅ Parser INLINE: [C]palavra ... [F/A]outra...
 */
function parseInlineChordLine(line: string): SongLine {
  const chords: SongChordToken[] = [];
  let lyric = "";

  let i = 0;

  let lastChordEndPos = -1;
  let lastWasChord = false;

  while (i < line.length) {
    const ch = line[i];

    if (ch === "[") {
      const close = line.indexOf("]", i + 1);
      if (close !== -1) {
        const insideRaw = line.slice(i + 1, close).trim();

        if (looksLikeChordToken(insideRaw)) {
          const inside = normalizeChordToken(insideRaw);

          let pos = lyric.length;

          if (lastWasChord && lastChordEndPos >= pos) {
            pos = lastChordEndPos + 1;
          }

          chords.push({ chord: inside, pos });
          lastChordEndPos = pos + inside.length;
          lastWasChord = true;

          i = close + 1;
          continue;
        }
      }
    }

    lyric += ch;
    lastWasChord = false;
    i++;
  }

  return {
    lyric: lyric.replace(/\s+$/g, ""),
    chords,
  };
}

function hasInlineChords(rawText: string) {
  const sample = rawText.slice(0, 20000);
  return /\[[A-G](?:#|b)?/i.test(sample);
}

export function buildSearchIndex(params: {
  title: string;
  artist?: string | null;
  content: SongContent;
}) {
  const lyrics = params.content.parts
    .flatMap((p) => p.lines)
    .map((l) => l.lyric)
    .join("\n");

  return [params.title, params.artist ?? "", lyrics].join("\n").toLowerCase();
}

/**
 * ✅ NOVO: encontra a próxima linha NÃO VAZIA, pulando vazios (inclusive linhas com espaços)
 */
function findNextNonEmptyLineIndex(lines: string[], startIndex: number) {
  for (let j = startIndex; j < lines.length; j++) {
    if ((lines[j] ?? "").trim() !== "") return j;
  }
  return -1;
}

export function parseSongFromChordAboveText(rawText: string): {
  content: SongContent;
  chordsUsed: string[];
} {
  const lines = normalizeLine(rawText)
    .split("\n")
    .map((l) => l.replace(/\s+$/g, ""));

  const parts: SongPart[] = [];
  let currentPart: SongPart = { type: "GERAL", title: null, lines: [] };
  parts.push(currentPart);

  const chordsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    const heading = parseHeading(line);
    if (heading) {
      currentPart = { type: heading.type, title: heading.title ?? null, lines: [] };
      parts.push(currentPart);
      continue;
    }

    const thisIsChord = isChordLine(line) || isSingleChordOnlyLine(line);

    if (thisIsChord) {
      // ✅ em vez de olhar só a linha i+1, pula vazios e tenta achar a próxima linha real de letra
      const j = findNextNonEmptyLineIndex(lines, i + 1);

      if (j !== -1) {
        const candidate = lines[j] ?? "";

        if (nextLineLooksLikeLyric(candidate)) {
          const chords = extractChordsWithPositions(line);
          chords.forEach((c) => chordsSet.add(c.chord));

          currentPart.lines.push({ lyric: candidate.trimEnd(), chords });

          // ✅ consumiu também as linhas vazias intermediárias
          i = j;
          continue;
        }
      }
    }

    if (line.trim()) {
      currentPart.lines.push({ lyric: line.trimEnd(), chords: [] });
      continue;
    }
  }

  const chordsUsed = Array.from(chordsSet);
  return { content: { parts }, chordsUsed };
}

export function parseSongFromInlineChordText(rawText: string): {
  content: SongContent;
  chordsUsed: string[];
} {
  const lines = normalizeLine(rawText)
    .split("\n")
    .map((l) => l.replace(/\s+$/g, ""));

  const parts: SongPart[] = [];
  let currentPart: SongPart = { type: "GERAL", title: null, lines: [] };
  parts.push(currentPart);

  const chordsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;

    const heading = parseHeading(line);
    if (heading) {
      currentPart = { type: heading.type, title: heading.title ?? null, lines: [] };
      parts.push(currentPart);
      continue;
    }

    const parsed = parseInlineChordLine(line);
    parsed.chords.forEach((c) => chordsSet.add(c.chord));

    currentPart.lines.push(parsed);
  }

  const chordsUsed = Array.from(chordsSet);
  return { content: { parts }, chordsUsed };
}

export function parseSongAuto(rawText: string): {
  content: SongContent;
  chordsUsed: string[];
  mode: "inline" | "above";
} {
  if (hasInlineChords(rawText)) {
    const r = parseSongFromInlineChordText(rawText);
    return { ...r, mode: "inline" };
  }

  const r = parseSongFromChordAboveText(rawText);
  return { ...r, mode: "above" };
}
