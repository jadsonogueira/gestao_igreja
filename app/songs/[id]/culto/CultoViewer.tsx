"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { transposeChordTokens, type AccidentalPref } from "@/lib/chords";

type SongChordToken = { chord: string; pos: number };
type SongLine = { lyric: string; chords: SongChordToken[] };
type SongPart = { type: string; title?: string | null; lines: SongLine[] };

type SongDetail = {
  id: string;
  title: string;
  artist: string | null;
  originalKey: string;
  tags: string[];
  content: { parts: SongPart[] };
};

function partLabel(p: SongPart) {
  const t = (p.title ?? "").trim();
  return t || p.type;
}

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

async function requestWakeLock(): Promise<any | null> {
  try {
    // Safari iOS pode não suportar; Chrome/Edge geralmente sim.
    // @ts-ignore
    if (!navigator?.wakeLock?.request) return null;
    // @ts-ignore
    return await navigator.wakeLock.request("screen");
  } catch {
    return null;
  }
}

export default function CultoViewer({ song }: { song: SongDetail }) {
  const accidentalPref: AccidentalPref = "sharp";

  const parts = useMemo(() => song.content?.parts ?? [], [song.content]);

  // modo culto: controles
  const [showChords, setShowChords] = useState(true);
  const [fontSize, setFontSize] = useState(20); // px
  const [lineHeight, setLineHeight] = useState(1.6);
  const [transpose, setTranspose] = useState(0);

  // wake lock
  const [keepAwake, setKeepAwake] = useState(false);
  const wakeLockRef = useRef<any | null>(null);

  useEffect(() => {
    let mounted = true;

    async function on() {
      const wl = await requestWakeLock();
      if (!mounted) return;
      wakeLockRef.current = wl;
      if (!wl) {
        toast("Seu iPhone/navegador não suportou manter a tela acordada.", { icon: "ℹ️" });
        setKeepAwake(false);
      }
    }

    async function off() {
      try {
        await wakeLockRef.current?.release?.();
      } catch {}
      wakeLockRef.current = null;
    }

    if (keepAwake) on();
    else off();

    return () => {
      mounted = false;
      off();
    };
  }, [keepAwake]);

  return (
    <main className="min-h-screen">
      {/* Top bar fixa */}
      <div className="sticky top-0 z-50 border-b bg-white/90 p-3 backdrop-blur dark:bg-black/70">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a className="text-sm underline opacity-70" href={`/songs/${song.id}`}>
              ← Sair do culto
            </a>

            <div className="mt-2">
              <div className="truncate text-lg font-semibold">{song.title}</div>
              <div className="text-xs opacity-70">
                {song.artist ? `${song.artist} • ` : ""}
                Tom: <strong>{song.originalKey}</strong>
                {transpose !== 0 ? (
                  <>
                    {" "}
                    • Transp: <span className="font-mono">{transpose > 0 ? `+${transpose}` : transpose}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="rounded border px-2 py-1 text-xs"
              onClick={() => setShowChords((v) => !v)}
              title="Mostrar/ocultar cifras"
            >
              {showChords ? "Ocultar cifras" : "Mostrar cifras"}
            </button>

            <button
              className="rounded border px-2 py-1 text-xs"
              onClick={() => setKeepAwake((v) => !v)}
              title="Tentar manter a tela ligada"
            >
              {keepAwake ? "Tela ligada ✓" : "Manter tela ligada"}
            </button>

            <div className="flex items-center gap-1">
              <button className="rounded border px-2 py-1 text-xs" onClick={() => setTranspose((v) => v - 1)}>
                -1
              </button>
              <button className="rounded border px-2 py-1 text-xs" onClick={() => setTranspose(0)} title="Visual">
                0
              </button>
              <button className="rounded border px-2 py-1 text-xs" onClick={() => setTranspose((v) => v + 1)}>
                +1
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                className="rounded border px-2 py-1 text-xs"
                onClick={() => setFontSize((v) => Math.max(14, v - 2))}
              >
                A-
              </button>
              <button
                className="rounded border px-2 py-1 text-xs"
                onClick={() => setFontSize((v) => Math.min(34, v + 2))}
              >
                A+
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                className="rounded border px-2 py-1 text-xs"
                onClick={() => setLineHeight((v) => Math.max(1.2, Number((v - 0.1).toFixed(1))))}
                title="Menos espaçamento"
              >
                ⇣
              </button>
              <button
                className="rounded border px-2 py-1 text-xs"
                onClick={() => setLineHeight((v) => Math.min(2.2, Number((v + 0.1).toFixed(1))))}
                title="Mais espaçamento"
              >
                ⇡
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="mx-auto max-w-4xl p-4">
        <div className="space-y-8">
          {parts.map((part, partIdx) => (
            <section key={`${part.type}-${partIdx}`} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-60">
                  {partLabel(part)}
                </div>
                <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
              </div>

              <div className="space-y-4">
                {part.lines.map((line, lineIdx) => {
                  const tokens = transposeChordTokens(line.chords ?? [], transpose, accidentalPref);
                  const overlay = showChords ? buildChordOverlay(line.lyric ?? "", tokens) : "";

                  return (
                    <div key={lineIdx} className="rounded-lg border p-4">
                      {overlay ? (
                        <div
                          className="whitespace-pre font-mono opacity-90"
                          style={{ fontSize: Math.max(12, fontSize - 2), lineHeight }}
                        >
                          {overlay}
                        </div>
                      ) : null}

                      <div
                        className="whitespace-pre font-mono"
                        style={{ fontSize, lineHeight }}
                      >
                        {line.lyric ?? ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 text-center text-xs opacity-50">
          Modo Culto • {song.id}
        </div>
      </div>
    </main>
  );
}