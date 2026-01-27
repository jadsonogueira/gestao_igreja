"use client";

import { useEffect, useMemo, useState } from "react";

type Accidental = "flat" | "natural" | "sharp";

type QualityPreset =
  | ""
  | "m"
  | "7"
  | "m7"
  | "maj7"
  | "sus2"
  | "sus4"
  | "add9"
  | "6"
  | "m6"
  | "9"
  | "m9"
  | "dim"
  | "aug";

type QualityMode = "preset" | "custom";

type ParsedChordFull = {
  root: string; // A-G
  acc: Accidental; // b/#/natural

  mode: QualityMode;
  preset: QualityPreset; // quando mode="preset"
  customSuffix: string; // quando mode="custom" (ex: "7(5-)", "m7(b5)", "7/9", "maj9"...)

  bassEnabled: boolean; // slash-bass real (C/F)
  bassRoot: string; // A-G
  bassAcc: Accidental; // b/#/natural
};

const ROOTS = ["C", "D", "E", "F", "G", "A", "B"] as const;

const QUALITY_OPTIONS: Array<{ value: QualityPreset; label: string }> = [
  { value: "", label: "Maj" },
  { value: "m", label: "m" },
  { value: "7", label: "7" },
  { value: "m7", label: "m7" },
  { value: "maj7", label: "maj7" },
  { value: "sus2", label: "sus2" },
  { value: "sus4", label: "sus4" },
  { value: "add9", label: "add9" },
  { value: "6", label: "6" },
  { value: "m6", label: "m6" },
  { value: "9", label: "9" },
  { value: "m9", label: "m9" },
  { value: "dim", label: "dim" },
  { value: "aug", label: "aug" },
];

// ✅ atalhos comuns em gospel/worship (inclui C7/9)
const CUSTOM_QUICK: Array<{ value: string; label: string }> = [
  { value: "7/9", label: "7/9" },
  { value: "m7/9", label: "m7/9" },
  { value: "7/4", label: "7/4" },
  { value: "7/13", label: "7/13" },
  { value: "maj9", label: "maj9" },
  { value: "m7(9)", label: "m7(9)" },
  { value: "7(b5)", label: "7(b5)" },
  { value: "7(5-)", label: "7(5-)" },
];

function accToText(acc: Accidental) {
  if (acc === "flat") return "b";
  if (acc === "sharp") return "#";
  return "";
}

function accToSymbol(acc: Accidental) {
  if (acc === "flat") return "♭";
  if (acc === "sharp") return "♯";
  return "♮";
}

function normalizeSpaces(s: string) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function buildChord(p: ParsedChordFull) {
  const root = `${p.root}${accToText(p.acc)}`;

  const suffix =
    p.mode === "custom"
      ? (p.customSuffix ?? "").trim()
      : (p.preset ?? "").trim();

  let out = `${root}${suffix}`;

  // ✅ slash-bass real (C/F, D/F#)
  if (p.bassEnabled && p.bassRoot) {
    const bass = `${p.bassRoot}${accToText(p.bassAcc ?? "natural")}`;
    out = `${out}/${bass}`;
  }

  return out;
}

/**
 * Parser permissivo:
 * - Root: A-G + (#|b)?
 * - Sufixo: qualquer coisa (inclui "7/9", "m7(b5)", "7(#11)" etc.)
 * - Slash-bass: só se a parte após "/" for uma NOTA (A-G com #/b). Senão, assume que é tensão (ex: 7/9).
 */
function safeParseChord(chord: string): ParsedChordFull {
  const raw = normalizeSpaces(chord);

  // split por "/" (mas cuidado com 7/9)
  const parts = raw.split("/").map((s) => normalizeSpaces(s));
  const mainRaw = parts[0] ?? "";
  const maybeAfterSlash = parts[1] ?? "";

  // main root + sufixo
  const m = mainRaw.match(/^([A-G])(#|b)?(.*)$/);
  if (!m) {
    return {
      root: "C",
      acc: "natural",
      mode: "preset",
      preset: "",
      customSuffix: "",
      bassEnabled: false,
      bassRoot: "C",
      bassAcc: "natural",
    };
  }

  const root = m[1];
  const acc: Accidental =
    m[2] === "#" ? "sharp" : m[2] === "b" ? "flat" : "natural";

  // se tinha "/" e o depois NÃO é nota, isso faz parte do sufixo: ex "7/9"
  const afterIsBassNote = !!maybeAfterSlash && /^([A-G])(#|b)?$/.test(maybeAfterSlash);

  const restMain = normalizeSpaces(m[3] ?? "");
  const rest =
    parts.length > 1 && maybeAfterSlash && !afterIsBassNote
      ? normalizeSpaces(`${restMain}/${maybeAfterSlash}`)
      : restMain;

  const known = new Set(QUALITY_OPTIONS.map((q) => q.value));
  const isKnown = known.has(rest as QualityPreset);

  let mode: QualityMode = "preset";
  let preset: QualityPreset = "";
  let customSuffix = "";

  if (isKnown) {
    mode = "preset";
    preset = rest as QualityPreset;
  } else {
    mode = "custom";
    customSuffix = rest; // pode ser "7/9", "7(5-)" etc
  }

  // slash-bass real
  let bassEnabled = false;
  let bassRoot = "C";
  let bassAcc: Accidental = "natural";

  if (afterIsBassNote) {
    const bm = maybeAfterSlash.match(/^([A-G])(#|b)?$/);
    if (bm) {
      bassEnabled = true;
      bassRoot = bm[1];
      bassAcc = bm[2] === "#" ? "sharp" : bm[2] === "b" ? "flat" : "natural";
    }
  }

  return {
    root,
    acc,
    mode,
    preset,
    customSuffix,
    bassEnabled,
    bassRoot,
    bassAcc,
  };
}

export default function ChordPicker(props: {
  open: boolean;
  chord: string;
  onClose: () => void;
  onPick: (newChord: string) => void;
}) {
  const { open, chord, onClose, onPick } = props;

  const initial = useMemo(() => safeParseChord(chord), [chord]);

  const [root, setRoot] = useState<string>(initial.root);
  const [acc, setAcc] = useState<Accidental>(initial.acc);

  const [mode, setMode] = useState<QualityMode>(initial.mode);
  const [preset, setPreset] = useState<QualityPreset>(initial.preset);
  const [customSuffix, setCustomSuffix] = useState<string>(initial.customSuffix);

  const [bassEnabled, setBassEnabled] = useState<boolean>(initial.bassEnabled);
  const [bassRoot, setBassRoot] = useState<string>(initial.bassRoot);
  const [bassAcc, setBassAcc] = useState<Accidental>(initial.bassAcc);

  useEffect(() => {
    if (!open) return;
    const init = safeParseChord(chord);

    setRoot(init.root);
    setAcc(init.acc);

    setMode(init.mode);
    setPreset(init.preset);
    setCustomSuffix(init.customSuffix);

    setBassEnabled(init.bassEnabled);
    setBassRoot(init.bassRoot);
    setBassAcc(init.bassAcc);
  }, [open, chord]);

  const preview = buildChord({
    root,
    acc,
    mode,
    preset,
    customSuffix,
    bassEnabled,
    bassRoot,
    bassAcc,
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <button
        className="absolute inset-0 bg-black/40"
        aria-label="Fechar"
        onClick={onClose}
      />

      {/* sheet */}
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-3xl rounded-t-2xl border bg-white shadow-xl dark:bg-neutral-950 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
        {/* ✅ HEADER STICKY: Cancelar/Aplicar sempre visíveis */}
        <div className="sticky top-0 z-10 border-b bg-white/95 p-3 backdrop-blur dark:bg-neutral-950/95 sm:rounded-t-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide opacity-70">
                Editar acorde
              </div>
              <div className="text-lg font-semibold font-mono truncate">
                {preview}
              </div>
              <div className="mt-1 text-xs opacity-60">
                Livre aceita: <span className="font-mono">7/9</span>,{" "}
                <span className="font-mono">m7(b5)</span>,{" "}
                <span className="font-mono">7(#11)</span>,{" "}
                <span className="font-mono">7(5-)</span>…
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                className="rounded-lg border px-3 py-2 text-sm font-semibold"
                onClick={() => onPick(preview)}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>

        {/* ✅ BODY COM SCROLL */}
        <div className="max-h-[70vh] overflow-auto p-4 sm:max-h-[70vh]">
          {/* 1) Nota base */}
          <div className="mb-4">
            <div className="mb-2 text-xs font-semibold opacity-70">Nota</div>
            <div className="flex flex-wrap gap-2">
              {ROOTS.map((r) => (
                <button
                  key={r}
                  className={`rounded-lg border px-3 py-2 text-sm font-mono ${
                    root === r ? "bg-black/5 dark:bg-white/10" : ""
                  }`}
                  onClick={() => setRoot(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* 2) Acidente */}
          <div className="mb-4">
            <div className="mb-2 text-xs font-semibold opacity-70">Acidente</div>
            <div className="flex gap-2">
              {(["flat", "natural", "sharp"] as Accidental[]).map((a) => (
                <button
                  key={a}
                  className={`rounded-lg border px-3 py-2 text-sm font-mono ${
                    acc === a ? "bg-black/5 dark:bg-white/10" : ""
                  }`}
                  onClick={() => setAcc(a)}
                  title={a}
                >
                  {accToSymbol(a)}
                </button>
              ))}
            </div>
          </div>

          {/* 3) Variação / Sufixo */}
          <div className="mb-4">
            <div className="mb-2 text-xs font-semibold opacity-70">Variação</div>

            <div className="flex flex-wrap gap-2 mb-3">
              <button
                className={`rounded-lg border px-3 py-2 text-xs font-mono ${
                  mode === "preset" ? "bg-black/5 dark:bg-white/10" : ""
                }`}
                onClick={() => setMode("preset")}
              >
                Presets
              </button>
              <button
                className={`rounded-lg border px-3 py-2 text-xs font-mono ${
                  mode === "custom" ? "bg-black/5 dark:bg-white/10" : ""
                }`}
                onClick={() => setMode("custom")}
              >
                Livre
              </button>
            </div>

            {mode === "preset" ? (
              // ✅ botões menores (layout compacto)
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {QUALITY_OPTIONS.map((q) => (
                  <button
                    key={q.value || "maj"}
                    className={`rounded-lg border px-2 py-2 text-sm font-mono ${
                      preset === q.value ? "bg-black/5 dark:bg-white/10" : ""
                    }`}
                    onClick={() => {
                      setPreset(q.value);
                      setCustomSuffix("");
                    }}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                  value={customSuffix}
                  onChange={(e) => setCustomSuffix(e.target.value)}
                  placeholder="Ex: 7/9, m7(b5), 7(#11), m7(9), maj9..."
                />

                {/* ✅ atalhos rápidos (inclui 7/9) */}
                <div className="flex flex-wrap gap-2">
                  {CUSTOM_QUICK.map((q) => (
                    <button
                      key={q.value}
                      className={`rounded-lg border px-2 py-1 text-xs font-mono ${
                        normalizeSpaces(customSuffix) === q.value
                          ? "bg-black/5 dark:bg-white/10"
                          : ""
                      }`}
                      onClick={() => setCustomSuffix(q.value)}
                      title="Aplicar no campo"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>

                <div className="text-xs opacity-60">
                  “7/9” aqui é **tensão** (não é baixo). Para inversão use “Baixo
                  (slash)” abaixo.
                </div>
              </div>
            )}
          </div>

          {/* 4) Baixo / Slash */}
          <div className="mb-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold opacity-70">Baixo (slash)</div>

              <button
                className={`rounded-lg border px-3 py-2 text-xs font-mono ${
                  bassEnabled ? "bg-black/5 dark:bg-white/10" : ""
                }`}
                onClick={() => setBassEnabled((v) => !v)}
                title="Ativar/desativar inversão (ex: C/E, C/F, D/F#)"
              >
                {bassEnabled ? "Ativo" : "Inativo"}
              </button>
            </div>

            {bassEnabled ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {ROOTS.map((r) => (
                    <button
                      key={`bass-${r}`}
                      className={`rounded-lg border px-3 py-2 text-sm font-mono ${
                        bassRoot === r ? "bg-black/5 dark:bg-white/10" : ""
                      }`}
                      onClick={() => setBassRoot(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  {(["flat", "natural", "sharp"] as Accidental[]).map((a) => (
                    <button
                      key={`bass-acc-${a}`}
                      className={`rounded-lg border px-3 py-2 text-sm font-mono ${
                        bassAcc === a ? "bg-black/5 dark:bg-white/10" : ""
                      }`}
                      onClick={() => setBassAcc(a)}
                      title={`Baixo: ${a}`}
                    >
                      {accToSymbol(a)}
                    </button>
                  ))}
                </div>

                <div className="text-xs opacity-60">
                  Exemplos: <span className="font-mono">C/E</span>,{" "}
                  <span className="font-mono">C/F</span>,{" "}
                  <span className="font-mono">D/F#</span>.
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 text-xs opacity-60">
            Ordem: <strong>Nota</strong> → <strong>Acidente</strong> →{" "}
            <strong>Variação</strong> → <strong>Baixo</strong>.
          </div>
        </div>
      </div>
    </div>
  );
}