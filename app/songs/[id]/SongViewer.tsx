"use client";

import { useMemo, useState } from "react";
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

function buildChordOverlay(lyric: string, chords: SongChordToken[]) {
  if (!chords?.length) return "";

  const maxNeeded = Math.max(
    lyric.length,
    ...chords.map((c) => (c.pos ?? 0) + (c.chord?.length ?? 0))
  );

  const arr = Array(Math.max(0, maxNeeded)).fill(" ");

  for (const c of chords) {
    const chord = String(c.chord ?? "");
    const start = Math.max(0, Math.min(Number(c.pos ?? 0), arr.length));
    for (let i = 0; i < chord.length && start + i < arr.length; i++) {
      arr[start + i] = chord[i];
    }
  }

  return arr.join("");
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

export default function SongViewer({ song }: { song: SongDetail }) {
  const [transpose, setTranspose] = useState(0);

  // preferência padrão: sustenidos
  const accidentalPref: AccidentalPref = "sharp";

  // base editável (sem transposição aplicada)
  const [partsBase, setPartsBase] = useState<SongPart[]>(
    () => deepCloneParts(song.content?.parts ?? [])
  );

  // ✅ snapshot do que está "salvo" (para dirty flag real)
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify(song.content?.parts ?? [])
  );

  const [saving, setSaving] = useState(false);

  const isDirty = useMemo(() => {
    try {
      return JSON.stringify(partsBase) !== savedSnapshot;
    } catch {
      return true;
    }
  }, [partsBase, savedSnapshot]);

  // chord picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<{
    partIdx: number;
    lineIdx: number;
    chordIdx: number;
    displayChord: string; // acorde já transposto (o que o usuário vê)
  } | null>(null);

  const parts = useMemo(() => partsBase ?? [], [partsBase]);

  function openPicker(
    partIdx: number,
    lineIdx: number,
    chordIdx: number,
    chordShown: string
  ) {
    setSelected({ partIdx, lineIdx, chordIdx, displayChord: chordShown });
    setPickerOpen(true);
  }

  function applyPickedChord(newChordShown: string) {
    if (!selected) return;

    // ✅ converte o acorde escolhido (na view transposta) de volta para a base
    const newChordBase =
      transpose !== 0
        ? transposeChord(newChordShown, -transpose, accidentalPref)
        : newChordShown;

    setPartsBase((prev) => {
      const next = deepCloneParts(prev);
      const target =
        next[selected.partIdx]?.lines?.[selected.lineIdx]?.chords?.[
          selected.chordIdx
        ];
      if (target) {
        target.chord = newChordBase;
      }
      return next;
    });

    setPickerOpen(false);
    setSelected(null);
  }

  async function saveToDatabase() {
    if (saving) return;

    if (!isDirty) {
      toast("Nenhuma alteração para salvar.");
      return;
    }

    setSaving(true);
    const t = toast.loading("Salvando...");

    try {
      const res = await fetch(`/api/songs/${song.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: partsBase },
        }),
      });

      const json = await res.json();

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Falha ao salvar");
      }

      // ✅ marca como salvo (zera dirty flag)
      setSavedSnapshot(JSON.stringify(partsBase));

      toast.success("Salvo com sucesso!", { id: t });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao salvar", { id: t });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-4 rounded-xl border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{song.title}</h1>
            <div className="text-sm opacity-80">
              {song.artist ? `${song.artist} • ` : ""}
              Tom original: <strong>{song.originalKey}</strong>
              {transpose !== 0 ? (
                <>
                  {" "}
                  • Transp.:{" "}
                  <span className="font-mono">
                    {transpose > 0 ? `+${transpose}` : transpose}
                  </span>
                </>
              ) : null}
            </div>

            {song.tags?.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {song.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border px-2 py-0.5 text-xs opacity-90"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
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
              title="Voltar ao tom original"
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
              className="rounded-lg border px-3 py-2 text-sm font-semibold"
              onClick={saveToDatabase}
              disabled={!isDirty || saving}
              title={!isDirty ? "Nada para salvar" : "Salvar alterações"}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

        <div className="mt-2 text-xs opacity-70">
          {isDirty ? (
            <>
              Alterações pendentes — clique em <strong>Salvar</strong>.
            </>
          ) : (
            <>Tudo salvo.</>
          )}
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
                const transposedTokens = transposeChordTokens(
                  line.chords ?? [],
                  transpose,
                  accidentalPref
                );

                const chordOverlay = buildChordOverlay(
                  line.lyric ?? "",
                  transposedTokens
                );

                return (
                  <div key={lineIdx} className="rounded-lg border p-3">
                    {chordOverlay ? (
                      <div className="mb-1 whitespace-pre font-mono text-sm leading-6 opacity-90">
                        {chordOverlay}
                      </div>
                    ) : null}

                    <div className="whitespace-pre font-mono text-sm leading-6">
                      {line.lyric ?? ""}
                    </div>

                    {transposedTokens.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {transposedTokens.map((c, chordIdx) => (
                          <button
                            key={`${c.chord}-${c.pos}-${chordIdx}`}
                            className="rounded-md border px-2 py-1 text-xs font-mono"
                            onClick={() =>
                              openPicker(partIdx, lineIdx, chordIdx, c.chord)
                            }
                            title="Clique para trocar o acorde"
                          >
                            {c.chord}
                          </button>
                        ))}
                      </div>
                    ) : null}
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