export type AccidentalPref = "sharp" | "flat";

/**
 * Notas cromáticas (enarmônicas) – preferências
 */
const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLATS  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

const NOTE_TO_INDEX: Record<string, number> = {
  C: 0,
  "B#": 0,

  "C#": 1,
  Db: 1,

  D: 2,

  "D#": 3,
  Eb: 3,

  E: 4,
  Fb: 4,

  F: 5,
  "E#": 5,

  "F#": 6,
  Gb: 6,

  G: 7,

  "G#": 8,
  Ab: 8,

  A: 9,

  "A#": 10,
  Bb: 10,

  B: 11,
  Cb: 11,
};

export type ParsedChord = {
  root: string;       // ex: C, F#, Bb
  quality: string;    // (mantemos simples por enquanto)
  suffix: string;     // ex: "7", "maj7", "m7(9)", "7(5-)", "°", etc.
  bass?: string;      // ex: G em C/G
  raw: string;
};

/**
 * Normalizações para aceitar variações comuns:
 * - ♯ -> #
 * - ♭ -> b
 * - "−" / "–" / "—" -> "-"
 * - remove espaços internos (ex: "G 7 ( 9 )" -> "G7(9)")
 */
function normalizeChordText(input: string) {
  return String(input ?? "")
    .trim()
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "");
}

function isValidNoteToken(token: string) {
  // nota: A-G + (#|b)?
  const m = token.match(/^([A-Ga-g])([#b])?$/);
  if (!m) return false;
  const root = `${m[1].toUpperCase()}${m[2] ?? ""}`;
  return NOTE_TO_INDEX[root] !== undefined;
}

/**
 * Parser bem permissivo (e mais “inteligente” com slash):
 * - Root: A-G + (#|b)?  (aceita ♯/♭ pois normalizamos)
 * - Sufixo: qualquer coisa depois do root (m, 7, maj7, sus, add, °, (9), (5-), b5, #11, etc.)
 * - Slash:
 *    ✅ se for /[A-G][#b]? -> é baixo (C/E, D/F#)
 *    ✅ se for /número ou /9 etc -> NÃO é baixo, faz parte do sufixo (D7M/9)
 */
export function parseChord(chord: string): ParsedChord | null {
  const raw = String(chord ?? "").trim();
  if (!raw) return null;

  const normalized = normalizeChordText(raw);
  if (!normalized) return null;

  // Decide se o "/..." é baixo OU parte do sufixo (ex: D7M/9)
  let main = normalized;
  let bassNote: string | undefined;

  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash > 0 && lastSlash < normalized.length - 1) {
    const left = normalized.slice(0, lastSlash);
    const right = normalized.slice(lastSlash + 1);

    // Só considera baixo se o lado direito for uma nota válida (A-G + #/b)
    if (isValidNoteToken(right)) {
      main = left;
      const bm = right.match(/^([A-Ga-g])([#b])?$/);
      if (bm) {
        const b = `${bm[1].toUpperCase()}${bm[2] ?? ""}`;
        if (NOTE_TO_INDEX[b] !== undefined) bassNote = b;
      }
    } else {
      // NÃO é baixo → mantém o slash dentro do main (ex: D7M/9)
      main = normalized;
    }
  }

  // root (A-G + acidente opcional) + resto (sufixo)
  const m = main.match(/^([A-Ga-g])([#b])?(.*)$/);
  if (!m) return null;

  const root = `${m[1].toUpperCase()}${m[2] ?? ""}`;
  const rest = (m[3] ?? ""); // já vem sem espaços

  // valida root
  if (NOTE_TO_INDEX[root] === undefined) return null;

  return {
    root,
    quality: "",
    suffix: rest,
    bass: bassNote,
    raw,
  };
}

function wrapIndex(n: number) {
  const x = n % 12;
  return x < 0 ? x + 12 : x;
}

function indexToNote(index: number, pref: AccidentalPref) {
  const i = wrapIndex(index);
  return pref === "flat" ? FLATS[i] : SHARPS[i];
}

export function transposeNote(note: string, semitones: number, pref: AccidentalPref) {
  const n = normalizeChordText(note); // aceita ♯/♭ também
  const m = n.match(/^([A-Ga-g])([#b])?$/);
  if (!m) return note;

  const key = `${m[1].toUpperCase()}${m[2] ?? ""}`;
  const idx = NOTE_TO_INDEX[key];
  if (idx === undefined) return note;

  return indexToNote(idx + semitones, pref);
}

/**
 * Transpõe acorde inteiro:
 * - Transpõe root
 * - Mantém sufixo (m, 7, maj7, sus4, add9, (9), (5-), °, etc.)
 * - Transpõe baixo (slash) se existir e se foi reconhecido como baixo
 *
 * Ex:
 *  C#m7(9)/G# +2 (sharp) -> D#m7(9)/A#
 *  D7M/9 +2 -> E7M/9  (aqui /9 fica no sufixo, não é baixo)
 */
export function transposeChord(chord: string, semitones: number, pref: AccidentalPref) {
  const p = parseChord(chord);
  if (!p) return chord;

  const newRoot = transposeNote(p.root, semitones, pref);
  const newBass = p.bass ? transposeNote(p.bass, semitones, pref) : undefined;

  const main = `${newRoot}${p.suffix ? p.suffix : ""}`;
  return newBass ? `${main}/${newBass}` : main;
}

/**
 * Transpõe uma lista de tokens { chord, pos }
 */
export function transposeChordTokens<T extends { chord: string }>(
  tokens: T[],
  semitones: number,
  pref: AccidentalPref
): T[] {
  if (!semitones) return tokens;
  return tokens.map((t) => ({ ...t, chord: transposeChord(t.chord, semitones, pref) }));
}