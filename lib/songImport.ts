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
 * ✅ Regex de acorde (estrito o suficiente para NÃO confundir palavras como "As",
 * mas abrangente para notação BR).
 *
 * Aceita exemplos:
 * A, A9, Am, A7, A7M, Amaj7, Asus4, A4, F#m7, D/F#, Bm/A,
 * D7M/9, E7(4), etc.
 *
 * Observações:
 * - 7M e 7m são comuns no BR -> aceitos
 * - º / ° (diminuto) -> aceitos
 * - /9 (tensão) -> aceito (além do slash de baixo /A, /C#)
 */
const CHORD_TOKEN_RE =
  /^[A-G](?:#|b)?(?:m(?!aj)|maj|min|dim|aug|sus2|sus4|add\d+)?(?:\d+)?(?:M|m)?(?:º|°)?(?:\([0-9+#b\s]+\))?(?:\/(?:[A-G](?:#|b)?|\d+))?$/;

function looksLikeChordToken(token: string) {
  const t = token.trim();
  if (!t) return false;
  if (t.length > 24) return false;
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

    // ✅ não “amassa” pelo tamanho da letra
    const pos = Math.max(0, col);

    out.push({ chord: raw.trim(), pos });
  }

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

/**
 * ✅ Parser atual (acorde em cima da letra) — mantido.
 */
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

    const heading = parseHeading(line);
    if (heading) {
      currentPart = { type: heading.type, title: heading.title ?? null, lines: [] };
      parts.push(currentPart);
      continue;
    }

    const next = i + 1 < lines.length ? (lines[i + 1] ?? "") : "";

    const thisIsChord = isChordLine(line) || isSingleChordOnlyLine(line);

    if (thisIsChord && nextLineLooksLikeLyric(next)) {
      const chords = extractChordsWithPositions(line);
      chords.forEach((c) => chordsSet.add(c.chord));

      currentPart.lines.push({ lyric: next.trimEnd(), chords });
      i++; // consome a linha de letra
      continue;
    }

    if (line.trim()) {
      currentPart.lines.push({ lyric: line.trimEnd(), chords: [] });
      continue;
    }
  }

  const chordsUsed = Array.from(chordsSet);
  return { content: { parts }, chordsUsed };
}

/* =========================================================
   ✅ NOVO: Parser INLINE  [F]texto [Bb/D][C/E]texto
   ========================================================= */

function hasInlineChords(rawText: string) {
  // precisa ter pelo menos um [X] que seja acorde válido
  const lines = normalizeLine(rawText).split("\n");
  for (const l of lines.slice(0, 80)) {
    // pega coisas dentro de []
    const re = /\[([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(l))) {
      const inside = String(m[1] ?? "").trim();
      if (looksLikeChordToken(inside)) return true;
    }
  }
  return false;
}

function parseInlineLine(lineRaw: string): SongLine {
  const line = normalizeLine(lineRaw);

  const chords: SongChordToken[] = [];
  let lyric = "";
  let lyricPos = 0;

  // varre a linha e captura [ACORDE]
  const re = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(line))) {
    const before = line.slice(lastIndex, m.index);
    lyric += before;
    lyricPos += before.length;

    const inside = String(m[1] ?? "").trim();

    // se for acorde válido, vira token
    // se não for (ex [VERSO]) deixa como texto mesmo (mantendo brackets)
    if (looksLikeChordToken(inside)) {
      chords.push({ chord: inside, pos: lyricPos });
    } else {
      // preserva como texto literal (inclui colchetes)
      const literal = `[${inside}]`;
      lyric += literal;
      lyricPos += literal.length;
    }

    lastIndex = m.index + m[0].length;
  }

  // resto
  const rest = line.slice(lastIndex);
  lyric += rest;

  // limpa final, mas mantém espaços do meio (importante pra colunas)
  lyric = lyric.replace(/\s+$/g, "");

  // remove duplicados exatos
  const seen = new Set<string>();
  const chordsFiltered = chords.filter((c) => {
    const key = `${c.pos}|${c.chord}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { lyric, chords: chordsFiltered };
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

    // headings continuam funcionando:
    // [VERSO], [INTRO], [REFRAO], etc.
    const heading = parseHeading(line);
    if (heading) {
      currentPart = { type: heading.type, title: heading.title ?? null, lines: [] };
      parts.push(currentPart);
      continue;
    }

    if (!line.trim()) continue;

    const parsed = parseInlineLine(line);

    // soma chordsUsed
    parsed.chords.forEach((c) => chordsSet.add(c.chord));

    currentPart.lines.push(parsed);
  }

  return { content: { parts }, chordsUsed: Array.from(chordsSet) };
}

/**
 * ✅ Parser AUTO:
 * - Se detectar inline, usa inline.
 * - Senão, usa acorde-em-cima (seu atual).
 */
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