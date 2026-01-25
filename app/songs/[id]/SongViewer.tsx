"use client";

import { useMemo, useState } from "react";
import type { SongDetail } from "./page";
import { transposeChordTokens, type AccidentalPref } from "@/lib/chords";

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

export default function SongViewer({ song }: { song: SongDetail }) {
  const [transpose, setTranspose] = useState(0);

  // preferência padrão: sustenidos (como combinamos)
  const accidentalPref: AccidentalPref = "sharp";

  const parts = useMemo(() => song.content?.parts ?? [], [song.content]);

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-4 rounded-xl border p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
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

          <div className="flex gap-2">
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
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {parts.map((part, idx) => (
          <section key={`${part.type}-${idx}`} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
                {partLabel(part)}
              </div>
              <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            </div>

            <div className="space-y-4">
              {part.lines.map((line, i) => {
                const transposedTokens = transposeChordTokens(
                  line.chords ?? [],
                  transpose,
                  accidentalPref
                );

                const chordOverlay = buildChordOverlay(line.lyric ?? "", transposedTokens);

                return (
                  <div key={i} className="rounded-lg border p-3">
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
                        {transposedTokens.map((c, k) => (
                          <button
                            key={`${c.chord}-${c.pos}-${k}`}
                            className="rounded-md border px-2 py-1 text-xs"
                            onClick={() => {
                              // daqui em diante entra o ChordPicker
                              console.log("Chord clicked:", c.chord, "pos:", c.pos);
                              alert(`Clique no acorde: ${c.chord}`);
                            }}
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
    </main>
  );
}