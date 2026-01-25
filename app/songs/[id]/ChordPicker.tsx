"use client";

import { useEffect, useMemo, useState } from "react";

type Accidental = "flat" | "natural" | "sharp";
type Quality =
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

type ParsedSimple = {
  root: string;
  acc: Accidental;
  quality: Quality;
};

const ROOTS = ["C", "D", "E", "F", "G", "A", "B"] as const;

const QUALITY_OPTIONS: Array<{ value: Quality; label: string }> = [
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

function buildChord(root: string, acc: Accidental, quality: Quality) {
  return `${root}${accToText(acc)}${quality}`;
}

function safeParseChord(chord: string): ParsedSimple {
  const raw = (chord ?? "").trim();

  const m = raw.match(/^([A-G])(#|b)?(.*)$/);
  if (!m) {
    return { root: "C", acc: "natural", quality: "" };
  }

  const root = m[1];
  const acc: Accidental =
    m[2] === "#"
      ? "sharp"
      : m[2] === "b"
      ? "flat"
      : "natural";

  const rest = (m[3] ?? "").trim();

  // quality: só aceitamos as opções conhecidas (se não for, cai em "")
  const known = new Set(QUALITY_OPTIONS.map((q) => q.value));
  const quality: Quality = known.has(rest as Quality) ? (rest as Quality) : "";

  return { root, acc, quality };
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
  const [quality, setQuality] = useState<Quality>(initial.quality);

  useEffect(() => {
    if (open) {
      const init = safeParseChord(chord);
      setRoot(init.root);
      setAcc(init.acc);
      setQuality(init.quality);
    }
  }, [open, chord]);

  const preview = buildChord(root, acc, quality);

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
          </div>

          <div className="flex gap-2">
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={onClose}>
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

        {/* 3) Variação */}
        <div>
          <div className="mb-2 text-xs font-semibold opacity-70">Variação</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {QUALITY_OPTIONS.map((q) => (
              <button
                key={q.value || "maj"}
                className={`rounded-lg border px-3 py-2 text-sm font-mono ${
                  quality === q.value ? "bg-black/5 dark:bg-white/10" : ""
                }`}
                onClick={() => setQuality(q.value)}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 text-xs opacity-60">
          Ordem: <strong>Nota</strong> → <strong>Acidente</strong> →{" "}
          <strong>Variação</strong>.
        </div>
      </div>
    </div>
  );
}