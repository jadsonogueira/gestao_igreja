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
  quality: string;    // ex: "", m, maj7, sus4, add9...
  suffix: string;     // ex: "7", "maj7", "m7(9)" etc (mantemos aqui junto)
  bass?: string;      // ex: G em C/G
  raw: string;
};

/**
 * Parser bem permissivo:
 * - Root: A-G + (#|b)?
 * - Restante: tudo até uma possível barra /bass
 */
export function parseChord(chord: string): ParsedChord | null {
  const raw = (chord ?? "").trim();
  if (!raw) return null;

  // separa slash bass
  const [main, bass] = raw.split("/").map((s) => s.trim());
  if (!main) return null;

  // root (A-G + acidente opcional)
  const m = main.match(/^([A-G])(#|b)?(.*)$/);
  if (!m) return null;

  const root = `${m[1]}${m[2] ?? ""}`;
  const rest = (m[3] ?? "").trim(); // qualidade + extensões

  // valida root
  if (NOTE_TO_INDEX[root] === undefined) return null;

  // bass opcional: A-G + (#|b)?
  let bassNote: string | undefined;
  if (bass) {
    const bm = bass.match(/^([A-G])(#|b)?$/);
    if (bm) {
      const b = `${bm[1]}${bm[2] ?? ""}`;
      if (NOTE_TO_INDEX[b] !== undefined) bassNote = b;
    }
  }

  return {
    root,
    quality: "", // não vamos separar profundamente agora
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
  const idx = NOTE_TO_INDEX[note];
  if (idx === undefined) return note;
  return indexToNote(idx + semitones, pref);
}

/**
 * Transpõe acorde inteiro:
 * - Transpõe root
 * - Mantém sufixo (m, 7, maj7, sus4, add9, (9), etc.)
 * - Transpõe baixo (slash) se existir
 *
 * Ex:
 *  C#m7(9)/G# +2 (sharp) -> D#m7(9)/A#
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