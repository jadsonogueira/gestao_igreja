"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import type { SongDetail } from "./page";
import ChordPicker from "./ChordPicker";
import {
  transposeChord,
  transposeChordTokens,
  type AccidentalPref,
} from "@/lib/chords";

type SongChordToken = { chord: string; pos: number };
type SongLine = { lyric: string; chords: SongChordToken[] };
type SongPart = { type: string; title?: string | null; lines: SongLine[] };

const KEY_OPTIONS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

function normKey(k?: string | null) {
  return String(k ?? "").trim().toUpperCase();
}

function keyToSemitone(key: string) {
  const k = normKey(key);
  const map: Record<string, number> = {
    C: 0,
    "C#": 1, DB: 1,
    D: 2,
    "D#": 3, EB: 3,
    E: 4, FB: 4,
    F: 5, "E#": 5,
    "F#": 6, GB: 6,
    G: 7,
    "G#": 8, AB: 8,
    A: 9,
    "A#": 10, BB: 10,
    B: 11, CB: 11,
  };
  return map[k] ?? 0;
}

function semitoneToKey(semi: number) {
  const s = ((semi % 12) + 12) % 12;
  return KEY_OPTIONS[s];
}

function transposeKey(originalKey: string, semitones: number) {
  const base = keyToSemitone(originalKey);
  return semitoneToKey(base + semitones);
}

function partLabel(p: SongPart) {
  const t = (p.title ?? "").trim();
  if (t) return t;
  return p.type;
}

function deepCloneParts(parts: SongPart[]): SongPart[] {
  return parts.map((p) => ({
    ...p,
    lines: p.lines.map((l) => ({
      ...l,
      chords: (l.chords ?? []).map((c) => ({ ...c })),
    })),
  }));
}

function transposePartsToNewBase(
  partsBase: SongPart[],
  semitones: number,
  accidentalPref: AccidentalPref
): SongPart[] {
  if (!semitones) return deepCloneParts(partsBase);

  return partsBase.map((p) => ({
    ...p,
    lines: (p.lines ?? []).map((l) => ({
      ...l,
      chords: (l.chords ?? []).map((c) => ({
        ...c,
        chord: transposeChord(String(c.chord ?? ""), semitones, accidentalPref),
      })),
    })),
  }));
}

/**
 * ✅ MODO ALINHADO (editor) — único modo agora:
 * - mantém coluna/pos
 * - sem scroll horizontal: o container corta o excesso (overflow-hidden)
 * - acordes menores, letra um pouco maior
 */
function ChordOverlayAligned({
  lyric,
  tokensShown,
  tokensBase,
  onOpenPicker,
  onMovePos,
}: {
  lyric: string;
  tokensShown: SongChordToken[];
  tokensBase: SongChordToken[];
  onOpenPicker: (tokenIndex: number, chordShown: string) => void;
  onMovePos: (tokenIndex: number, delta: number) => void;
}) {
  if (!tokensShown?.length) return null;

  const maxNeeded = Math.max(
    lyric.length,
    ...tokensShown.map((c) => (c.pos ?? 0) + (String(c.chord ?? "").length || 0))
  );
  const safeLen = Math.max(0, maxNeeded);

  const arr = Array(safeLen).fill(" ");
  for (const c of tokensShown) {
    const chord = String(c.chord ?? "");
    const start = Math.max(0, Math.min(Number(c.pos ?? 0), arr.length));
    for (let i = 0; i < chord.length && start + i < arr.length; i++) {
      arr[start + i] = chord[i];
    }
  }
  const overlay = arr.join("");

  type Segment =
    | { type: "space"; text: string }
    | { type: "chord"; text: string; tokenIndex: number };

  const segments: Segment[] = [];
  const sorted = [...tokensShown]
    .map((t, idx) => ({
      tokenIndex: idx,
      pos: Math.max(0, Number(t.pos ?? 0)),
      chord: String(t.chord ?? ""),
    }))
    .sort((a, b) => a.pos - b.pos);

  let cursor = 0;
  for (const t of sorted) {
    const start = Math.min(t.pos, overlay.length);
    if (start > cursor) {
      segments.push({ type: "space", text: overlay.slice(cursor, start) });
      cursor = start;
    }
    const end = Math.min(start + t.chord.length, overlay.length);
    segments.push({
      type: "chord",
      text: overlay.slice(start, end) || t.chord,
      tokenIndex: t.tokenIndex,
    });
    cursor = end;
  }
  if (cursor < overlay.length) segments.push({ type: "space", text: overlay.slice(cursor) });

  return (
    <div className="overflow-hidden">
      <div className="whitespace-pre font-mono text-[12px] leading-5 opacity-90">
        {segments.map((seg, i) => {
          if (seg.type === "space") return <span key={`sp-${i}`}>{seg.text}</span>;

          const idx = seg.tokenIndex;
          const basePos = tokensBase?.[idx]?.pos ?? 0;

          return (
            <span key={`ch-${i}`} className="inline-flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onMovePos(idx, -1)}
                className="px-0.5 text-[11px] opacity-50 hover:opacity-100"
                title={`Mover para esquerda (pos ${basePos} → ${Math.max(0, basePos - 1)})`}
                aria-label="Mover acorde para esquerda"
              >
                ◀
              </button>

              <button
                type="button"
                onClick={() => onOpenPicker(idx, seg.text)}
                className="underline decoration-dotted underline-offset-2 hover:opacity-80"
                title="Clique para trocar o acorde"
              >
                {seg.text}
              </button>

              <button
                type="button"
                onClick={() => onMovePos(idx, +1)}
                className="px-0.5 text-[11px] opacity-50 hover:opacity-100"
                title={`Mover para direita (pos ${basePos} → ${basePos + 1})`}
                aria-label="Mover acorde para direita"
              >
                ▶
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function SongViewer({ song }: { song: SongDetail }) {
  const router = useRouter();

  const [transpose, setTranspose] = useState(0);
  const accidentalPref: AccidentalPref = "sharp";
  const [savedOriginalKey, setSavedOriginalKey] = useState(song.originalKey);

  const [partsBase, setPartsBase] = useState<SongPart[]>(
    () => deepCloneParts(song.content?.parts ?? [])
  );

  const [snapshot, setSnapshot] = useState(() =>
    JSON.stringify({ parts: song.content?.parts ?? [], originalKey: song.originalKey })
  );

  const dirty = useMemo(() => {
    const now = JSON.stringify({ parts: partsBase, originalKey: savedOriginalKey, transpose });
    return now !== JSON.stringify({ ...JSON.parse(snapshot), transpose: 0 });
  }, [partsBase, savedOriginalKey, transpose, snapshot]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<{
    partIdx: number;
    lineIdx: number;
    chordIdx: number;
    displayChord: string;
  } | null>(null);

  const parts = useMemo(() => partsBase ?? [], [partsBase]);

  function openPickerFromOverlay(
    partIdx: number,
    lineIdx: number,
    tokenIndex: number,
    chordShown: string
  ) {
    setSelected({ partIdx, lineIdx, chordIdx: tokenIndex, displayChord: chordShown });
    setPickerOpen(true);
  }

  function applyPickedChord(newChordShown: string) {
    if (!selected) return;

    const newChordBase =
      transpose !== 0
        ? transposeChord(newChordShown, -transpose, accidentalPref)
        : newChordShown;

    setPartsBase((prev) => {
      const next = deepCloneParts(prev);
      const target = next[selected.partIdx]?.lines?.[selected.lineIdx]?.chords?.[selected.chordIdx];
      if (target) target.chord = newChordBase;
      return next;
    });

    setPickerOpen(false);
    setSelected(null);
  }

  function moveChordPos(partIdx: number, lineIdx: number, chordIdx: number, delta: number) {
    setPartsBase((prev) => {
      const next = deepCloneParts(prev);
      const target = next[partIdx]?.lines?.[lineIdx]?.chords?.[chordIdx];
      if (!target) return prev;
      target.pos = Math.max(0, Number(target.pos ?? 0) + delta);
      return next;
    });
  }

  async function handleSave() {
    const t = toast.loading("Salvando...");

    try {
      const newBaseParts = transposePartsToNewBase(partsBase, transpose, accidentalPref);
      const newOriginalKey = transposeKey(savedOriginalKey, transpose);

      const res = await fetch(`/api/songs/${song.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: newBaseParts },
          originalKey: newOriginalKey,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Erro ao salvar");
      }

      setPartsBase(newBaseParts);
      setSavedOriginalKey(json.data.originalKey ?? newOriginalKey);
      setTranspose(0);
      setSnapshot(
        JSON.stringify({
          parts: newBaseParts,
          originalKey: json.data.originalKey ?? newOriginalKey,
        })
      );

      toast.success("Tudo salvo.", { id: t });
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar", { id: t });
    }
  }

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/songs");
  }

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-4 rounded-xl border p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button className="text-sm underline opacity-70" onClick={handleBack}>
              ← Voltar
            </button>

            <h1 className="text-2xl font-semibold mt-2">{song.title}</h1>

            <div className="text-sm opacity-80">
              {song.artist ? `${song.artist} • ` : ""}
              Tom salvo: <strong>{savedOriginalKey}</strong>
              {transpose !== 0 ? (
                <>
                  {" "}
                  • Tom (após salvar):{" "}
                  <strong>{transposeKey(savedOriginalKey, transpose)}</strong>{" "}
                  • Transp.:{" "}
                  <span className="font-mono">
                    {transpose > 0 ? `+${transpose}` : transpose}
                  </span>
                </>
              ) : null}
            </div>

            <div className="mt-2 text-sm opacity-70">
              {dirty ? "Alterações pendentes." : "Tudo salvo."}
            </div>

            <div className="mt-3 text-xs opacity-60">
              Dica: use ◀ ▶ em cima do acorde para ajustar a posição (pos) sem mexer no texto importado.
            </div>

            {song.tags?.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {song.tags.map((t) => (
                  <span key={t} className="rounded-full border px-2 py-0.5 text-xs opacity-90">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/songs/import"
              className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 transition"
              title="Importar uma cifra colando texto"
            >
              Importar
            </Link>

            <Link
              href={`/songs/${song.id}/culto`}
              className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 transition"
              title="Abrir modo culto"
            >
              Culto
            </Link>

            <button
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={() => setTranspose((v) => v - 1)}
              title="Transpor -1"
            >
              -1
            </button>
            <button
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={() => setTranspose(0)}
              title="Voltar ao tom salvo (visual)"
            >
              0
            </button>
            <button
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={() => setTranspose((v) => v + 1)}
              title="Transpor +1"
            >
              +1
            </button>

            <button
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={handleSave}
              disabled={!dirty}
              title={dirty ? "Salvar" : "Nada para salvar"}
            >
              Salvar
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {parts.map((part, partIdx) => (
          <section key={`${part.type}-${partIdx}`} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
                {partLabel(part)}
              </div>
              <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            </div>

            <div className="space-y-4">
              {part.lines.map((line, lineIdx) => {
                const tokensBase = line.chords ?? [];
                const tokensShown = transposeChordTokens(tokensBase, transpose, accidentalPref);

                return (
                  <div key={lineIdx} className="rounded-lg border p-3">
                    <ChordOverlayAligned
                      lyric={line.lyric ?? ""}
                      tokensShown={tokensShown}
                      tokensBase={tokensBase}
                      onOpenPicker={(tokenIndex, chordShown) =>
                        openPickerFromOverlay(partIdx, lineIdx, tokenIndex, chordShown)
                      }
                      onMovePos={(tokenIndex, delta) =>
                        moveChordPos(partIdx, lineIdx, tokenIndex, delta)
                      }
                    />

                    {/* ✅ letra confortável, mas sem “estourar” */}
                    <div className="mt-2 whitespace-pre-wrap font-mono text-[16px] leading-7 break-words">
                      {line.lyric ?? ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 text-xs opacity-60">
        ID: <span className="font-mono">{song.id}</span>
      </div>

      <ChordPicker
        open={pickerOpen}
        chord={selected?.displayChord ?? "C"}
        onClose={() => {
          setPickerOpen(false);
          setSelected(null);
        }}
        onPick={applyPickedChord}
      />
    </main>
  );
}