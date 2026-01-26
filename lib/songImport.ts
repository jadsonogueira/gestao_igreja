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
  // Aceita:
  // [INTRO], [VERSO], [REFRAO], INTRO], [INTRO
  let t = line.trim();
  if (!t) return t;

  // remove um colchete inicial opcional
  if (t.startsWith("[")) t = t.slice(1).trimStart();
  // remove um colchete final opcional
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
      // mantém o título original (como veio), mas tipa pelo "type"
      return { type: h.type, title: raw };
    }
  }
  return null;
}

/**
 * ✅ Validador de token de acorde (mais permissivo, BR-friendly)
 *
 * Aceita:
 * A9, Bm/A, D/F#, E7(4), D7M, E7M, D7M/9, Fº, F#4, E4, etc.
 *
 * Regras simples:
 * - começa com A-G (+ acidente opcional)
 * - só contém caracteres típicos de acordes
 * - não pode ser gigantesco
 */
function looksLikeChordToken(token: string) {
  const t = token.trim();
  if (!t) return false;
  if (t.length > 24) return false; // mais seguro que 14 (seus acordes passam de 14 fácil)

  // precisa começar com nota
  if (!/^[A-Ga-g]/.test(t)) return false;

  // caracteres permitidos em acordes comuns
  // (inclui º e /9 usados no BR)
  if (!/^[A-Ga-g0-9#్బbMmº°()\/+\-]+$/.test(t)) return false;

  // evita tokens óbvios que são só número/ruído
  if (/^[A-Ga-g]$/.test(t)) return true; // A, B, C etc são válidos
  if (/^[A-Ga-g][#b]?$/.test(t)) return true; // C#, Db

  // pelo menos um padrão mínimo: root + resto (ou root puro já aceitamos)
  // aqui só checamos se o root faz sentido
  const m = t.match(/^([A-Ga-g])(#|b)?/);
  if (!m) return false;

  return true;
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

/**
 * Heurística para detectar se a próxima linha é "letra"
 */
function nextLineLooksLikeLyric(next: string) {
  const t = next.trim();
  if (!t) return false;

  // se a próxima linha também parece "só acorde", não é lyric
  if (isChordLine(next) || isSingleChordOnlyLine(next)) return false;

  // se contém letras (inclui acentos), é lyric
  if (/[A-Za-zÀ-ÿ]/.test(t)) return true;

  // se tem espaços (frase), também
  if (/\s/.test(t) && t.length >= 3) return true;

  return true;
}

function extractChordsWithPositions(chordLine: string, _lyricLine: string): SongChordToken[] {
  const out: SongChordToken[] = [];

  const re = /\S+/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(chordLine))) {
    const raw = m[0];
    if (!looksLikeChordToken(raw)) continue;

    const col = m.index;

    /**
     * ✅ CORREÇÃO CRÍTICA:
     * NÃO limitar o pos pelo tamanho da letra.
     * Se o acorde estiver mais à direita que a letra, tudo bem:
     * o renderer (overlay) já expande a linha.
     *
     * Isso evita os acordes "colidirem" no final e virarem lixo tipo "E7(4EE".
     */
    const pos = Math.max(0, col);

    out.push({ chord: raw.trim(), pos });
  }

  // remove duplicatas
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

    const thisIsChord = isChordLine(line) || isSingleChordOnlyLine(line);

    // par "acorde em cima" + "letra"
    if (thisIsChord && nextLineLooksLikeLyric(next)) {
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

    // linha vazia: ignora
  }

  const chordsUsed = Array.from(chordsSet);
  return { content: { parts }, chordsUsed };
}