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
  customSuffix: string; // quando mode="custom" (ex: "7(5-)", "m7(b5)", "maj9", "7(#11)")
  bassRoot?: string; // A-G
  bassAcc?: Accidental; // b/#/natural
};

const ROOTS = ["C", "D", "E", "F", "G", "A", "B"] as const;

const QUALITY_OPTIONS: Array<{ value: QualityPreset; label: string }> = [
  { value: "", label: "Maj (normal)" },
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

  if (p.bassRoot) {
    const bass = `${p.bassRoot}${accToText(p.bassAcc ?? "natural")}`;
    out = `${out}/${bass}`;
  }

  return out;
}

/**
 * Parser PERMISSIVO:
 * - Root: A-G + (#|b)?
 * - Sufixo: tudo que vier (inclui "7(5-)", "m7(b5)", "maj9", "#11", etc.)
 * - Slash bass: /A-G + (#|b)?
 */
function safeParseChord(chord: string): ParsedChordFull {
  const raw = normalizeSpaces(chord);

  // separa slash bass (se existir)
  const [mainRaw, bassRaw] = raw.split("/").map((s) => normalizeSpaces(s));

  // main
  const m = mainRaw.match(/^([A-G])(#|b)?(.*)$/);
  if (!m) {
    return {
      root: "C",
      acc: "natural",
      mode: "preset",
      preset: "",
      customSuffix: "",
      bassRoot: undefined,
      bassAcc: "natural",
    };
  }

  const root = m[1];
  const acc: Accidental =
    m[2] === "#" ? "sharp" : m[2] === "b" ? "flat" : "natural";

  const rest = normalizeSpaces(m[3] ?? ""); // sufixo (qualquer coisa)

  const known = new Set(QUALITY_OPTIONS.map((q) => q.value));
  const isKnown = known.has(rest as QualityPreset);

  let mode: QualityMode = "preset";
  let preset: QualityPreset = "";
  let customSuffix = "";

  if (isKnown) {
    mode = "preset";
    preset = rest as QualityPreset;
    customSuffix = "";
  } else {
    // se não é exatamente um preset conhecido, mantemos como custom
    mode = "custom";
    preset = "";
    customSuffix = rest; // pode ser "7(5-)" etc
  }

  // bass
  let bassRoot: string | undefined;
  let bassAcc: Accidental = "natural";

  if (bassRaw) {
    const bm = bassRaw.match(/^([A-G])(#|b)?$/);
    if (bm) {
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

  const [bassEnabled, setBassEnabled] = useState<boolean>(!!initial.bassRoot);
  const [bassRoot, setBassRoot] = useState<string>(initial.bassRoot ?? "C");
  const [bassAcc, setBassAcc] = useState<Accidental>(initial.bassAcc ?? "natural");

  useEffect(() => {
    if (!open) return;

    const init = safeParseChord(chord);

    setRoot(init.root);
    setAcc(init.acc);

    setMode(init.mode);
    setPreset(init.preset);
    setCustomSuffix(init.customSuffix);

    setBassEnabled(!!init.bassRoot);
    setBassRoot(init.bassRoot ?? "C");
    setBassAcc(init.bassAcc ?? "natural");
  }, [open, chord]);

  const preview = buildChord({
    root,
    acc,
    mode,
    preset,
    customSuffix,
    bassRoot: bassEnabled ? bassRoot : undefined,
    bassAcc: bassEnabled ? bassAcc : "natural",
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
      <div className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-3xl rounded-t-2xl border bg-white p-4 shadow-xl dark:bg-neutral-950 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide opacity-70">
              Editar acorde
            </div>
            <div className="text-lg font-semibold font-mono">{preview}</div>
            <div className="mt-1 text-xs opacity-60">
              Dica: para “b5”, você pode usar <span className="font-mono">7(b5)</span>{" "}
              ou <span className="font-mono">7(5-)</span>.
            </div>
          </div>

          <div className="flex gap-2">
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
              title="Usar opções comuns"
            >
              Presets
            </button>
            <button
              className={`rounded-lg border px-3 py-2 text-xs font-mono ${
                mode === "custom" ? "bg-black/5 dark:bg-white/10" : ""
              }`}
              onClick={() => setMode("custom")}
              title="Digitar sufixo livre (ex: 7(b5), m7(9), maj9...)"
            >
              Livre
            </button>
          </div>

          {mode === "preset" ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QUALITY_OPTIONS.map((q) => (
                <button
                  key={q.value || "maj"}
                  className={`rounded-lg border px-3 py-2 text-sm font-mono ${
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
            <div className="space-y-2">
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                value={customSuffix}
                onChange={(e) => setCustomSuffix(e.target.value)}
                placeholder='Ex: 7(b5), 7(5-), m7(9), maj9, 7(#11), m7(b5)...'
              />
              <div className="text-xs opacity-60">
                Aqui você pode usar qualquer combinação. O app vai manter exatamente o que
                você digitar.
              </div>
            </div>
          )}
        </div>

        {/* 4) Baixo / Slash */}
        <div className="mb-1">
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
  );
}