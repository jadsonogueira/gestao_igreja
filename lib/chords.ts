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

function wrapIndex(n: number) {
  const x = n % 12;
  return x < 0 ? x + 12 : x;
}

function indexToNote(index: number, pref: AccidentalPref) {
  const i = wrapIndex(index);
  return pref === "flat" ? FLATS[i] : SHARPS[i];
}

function normalizeNoteToken(token: string) {
  const t = normalizeChordText(token);
  const m = t.match(/^([A-Ga-g])([#b])?$/);
  if (!m) return null;
  const note = `${m[1].toUpperCase()}${m[2] ?? ""}`;
  return NOTE_TO_INDEX[note] !== undefined ? note : null;
}

/**
 * Detecta se um sufixo tem um "/X" no fim:
 * - se X for nota (A-G + #/b) -> baixo real
 * - se X for número (/9, /13) ou qualquer outra coisa -> NÃO é baixo, é extensão
 */
function splitBassIfValid(mainWithMaybeSlash: string): { main: string; bass?: string } {
  const s = mainWithMaybeSlash;

  const lastSlash = s.lastIndexOf("/");
  if (lastSlash <= 0 || lastSlash >= s.length - 1) {
    return { main: s };
  }

  const left = s.slice(0, lastSlash);
  const right = s.slice(lastSlash + 1);

  const bass = normalizeNoteToken(right);
  if (!bass) {
    // não é nota -> mantém tudo como main (ex: D7M/9)
    return { main: s };
  }

  return { main: left, bass };
}

/**
 * Parser bem permissivo (e “inteligente” com slash):
 * - Root: A-G + (#|b)?
 * - Sufixo: tudo depois do root (m, 7, maj7, sus4, add9, °, (9), (5-), #11, b5, /9 etc.)
 * - Slash:
 *    ✅ se for /nota -> é baixo (C/E, D/F#)
 *    ✅ se for /número -> NÃO é baixo (D7M/9, C7/9)
 */
export function parseChord(chord: string): ParsedChord | null {
  const raw = String(chord ?? "").trim();
  if (!raw) return null;

  const normalized = normalizeChordText(raw);
  if (!normalized) return null;

  // separa baixo somente se for /NOTA
  const { main, bass } = splitBassIfValid(normalized);

  // root (A-G + acidente opcional) + resto
  const m = main.match(/^([A-Ga-g])([#b])?(.*)$/);
  if (!m) return null;

  const root = `${m[1].toUpperCase()}${m[2] ?? ""}`;
  const rest = (m[3] ?? ""); // sufixo (já sem espaços)

  if (NOTE_TO_INDEX[root] === undefined) return null;

  return {
    root,
    quality: "",
    suffix: rest,
    bass,
    raw,
  };
}

export function transposeNote(note: string, semitones: number, pref: AccidentalPref) {
  const n = normalizeChordText(note);
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
 *  C#m7(9)/G# +2 -> D#m7(9)/A#
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