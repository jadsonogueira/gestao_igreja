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

function parseHeading(line: string): { type: string; title?: string } | null {
  const t = line.trim();
  if (!t) return null;

  // Ex.: "Verso 1", "Refrão", "Ponte (2x)"
  for (const h of HEADING_MAP) {
    if (h.re.test(t)) {
      return { type: h.type, title: t };
    }
  }
  return null;
}

// Aceita acordes comuns: A, Am, A7, Amaj7, Asus4, Aadd9, F#m7, G/B, C#7(9), etc.
const CHORD_TOKEN_RE =
  /^[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus2|sus4|add9)?(?:\d+)?(?:\([^\)]+\))?(?:\/[A-G](?:#|b)?)?$/i;

function looksLikeChordToken(token: string) {
  const t = token.trim();
  if (!t) return false;
  if (t.length > 12) return false; // evita tokens gigantes
  return CHORD_TOKEN_RE.test(t);
}

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

function extractChordsWithPositions(chordLine: string, lyricLine: string): SongChordToken[] {
  const out: SongChordToken[] = [];

  // varre por sequências não-espaço, mantendo index
  const re = /\S+/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(chordLine))) {
    const raw = m[0];
    if (!looksLikeChordToken(raw)) continue;

    const col = m.index;
    const pos = Math.min(col, Math.max(lyricLine.length, 0));
    out.push({ chord: raw.trim(), pos });
  }

  // remove duplicados
  const seen = new Set<string>();
  return out.filter((c) => {
    const key = `${c.pos}|${c.chord}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

export function parseSongFromChordAboveText(rawText: string): {
  content: SongContent;
  chordsUsed: string[];
} {
  const lines = normalizeLine(rawText)
    .split("\n")
    .map((l) => l.replace(/\s+$/g, "")); // trim end

  const parts: SongPart[] = [];
  let currentPart: SongPart = { type: "GERAL", title: null, lines: [] };
  parts.push(currentPart);

  const chordsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // headings
    const heading = parseHeading(line);
    if (heading) {
      currentPart = { type: heading.type, title: heading.title ?? null, lines: [] };
      parts.push(currentPart);
      continue;
    }

    const next = i + 1 < lines.length ? (lines[i + 1] ?? "") : "";

    // par "acorde em cima" + "letra"
    if (isChordLine(line) && next.trim() && !isChordLine(next)) {
      const lyric = next;
      const chords = extractChordsWithPositions(line, lyric);
      chords.forEach((c) => chordsSet.add(c.chord));

      currentPart.lines.push({ lyric: lyric.trimEnd(), chords });
      i++; // pula a linha de letra já consumida
      continue;
    }

    // linha só de letra
    if (line.trim()) {
      currentPart.lines.push({ lyric: line.trimEnd(), chords: [] });
      continue;
    }

    // linha vazia: ignora (não polui o content)
  }

  const chordsUsed = Array.from(chordsSet);
  return { content: { parts }, chordsUsed };
}