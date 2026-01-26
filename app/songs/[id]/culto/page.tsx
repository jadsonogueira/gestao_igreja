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
  createdAt: string;
  updatedAt: string;
};

function partLabel(p: SongPart) {
  const t = (p.title ?? "").trim();
  if (t) return t;
  return p.type;
}

function buildChordOverlay(lyric: string, chords: SongChordToken[]) {
  if (!chords?.length) return "";

  const maxNeeded = Math.max(
    lyric.length,
    ...chords.map((c) => (c.pos ?? 0) + (String(c.chord ?? "").length || 0))
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
    // @ts-ignore
    if (!navigator?.wakeLock?.request) return null;
    // @ts-ignore
    return await navigator.wakeLock.request("screen");
  } catch {
    return null;
  }
}

export default function SongCultoPage({ params }: { params: { id: string } }) {
  const [song, setSong] = useState<SongDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [transpose, setTranspose] = useState(0);
  const accidentalPref: AccidentalPref = "sharp";

  // ✅ controles (minimalistas)
  const [showChords, setShowChords] = useState(true);

  // banana-style: menor e mais “colado”
  const [fontSize, setFontSize] = useState(18); // letra
  const [chordSize, setChordSize] = useState(12); // cifra
  const [tight, setTight] = useState(true); // espaçamento bem compacto

  // ✅ wake lock
  const [keepAwake, setKeepAwake] = useState(false);
  const wakeLockRef = useRef<any | null>(null);

  // ✅ painel (para esconder a barra superior)
  const [showHud, setShowHud] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/songs/${params.id}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json?.success) throw new Error(json?.error || "Erro ao buscar cifra");
    setSong(json.data);
    setLoading(false);
  }

  useEffect(() => {
    load().catch((e: any) => {
      toast.error(e?.message || "Erro ao carregar");
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    let mounted = true;

    async function on() {
      const wl = await requestWakeLock();
      if (!mounted) return;
      wakeLockRef.current = wl;

      if (!wl) {
        toast("Seu navegador não suportou 'manter a tela ligada'.", { icon: "ℹ️" });
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

  const parts = useMemo(() => song?.content?.parts ?? [], [song]);

  // ✅ valores compactos estilo banana
  const lyricLineHeight = tight ? 1.2 : 1.45;
  const chordLineHeight = tight ? 1.0 : 1.2;

  return (
    <main className="mx-auto max-w-4xl px-3 py-3">
      {/* HUD minimalista (pode esconder) */}
      <div className="sticky top-0 z-10">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowHud((v) => !v)}
            className="rounded-full border bg-white/90 px-3 py-2 text-sm shadow-sm backdrop-blur"
            title={showHud ? "Fechar controles" : "Abrir controles"}
          >
            {showHud ? "Fechar" : "⚙️"}
          </button>
        </div>

        {showHud ? (
          <div className="mt-2 rounded-xl border bg-white/95 p-3 shadow-sm backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <a className="text-sm opacity-70 underline" href={`/songs/${params.id}`}>
                  ← Voltar
                </a>

                <div className="mt-1 text-xl font-semibold truncate">{song?.title ?? "Cifra"}</div>
                <div className="text-sm opacity-80">
                  {song?.artist ? `${song.artist} • ` : ""}
                  Tom: <strong>{song?.originalKey ?? "-"}</strong>{" "}
                  {transpose !== 0 ? (
                    <>
                      • Transp.:{" "}
                      <span className="font-mono">{transpose > 0 ? `+${transpose}` : transpose}</span>
                    </>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="rounded-lg border px-3 py-2 text-sm"
                    onClick={() => setShowChords((v) => !v)}
                    title="Mostrar/ocultar cifras"
                  >
                    {showChords ? "Cifras ✓" : "Cifras"}
                  </button>

                  <button
                    className="rounded-lg border px-3 py-2 text-sm"
                    onClick={() => setKeepAwake((v) => !v)}
                    title="Tentar manter a tela ligada"
                  >
                    {keepAwake ? "Tela ✓" : "Tela"}
                  </button>

                  <button
                    className="rounded-lg border px-3 py-2 text-sm"
                    onClick={() => setTight((v) => !v)}
                    title="Alternar espaçamento"
                  >
                    {tight ? "Compacto ✓" : "Compacto"}
                  </button>

                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border px-3 py-2 text-sm"
                      onClick={() => setFontSize((v) => Math.max(14, v - 1))}
                      title="Diminuir letra"
                    >
                      A-
                    </button>
                    <button
                      className="rounded-lg border px-3 py-2 text-sm"
                      onClick={() => setFontSize((v) => Math.min(34, v + 1))}
                      title="Aumentar letra"
                    >
                      A+
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border px-3 py-2 text-sm"
                      onClick={() => setChordSize((v) => Math.max(10, v - 1))}
                      title="Diminuir cifra"
                    >
                      c-
                    </button>
                    <button
                      className="rounded-lg border px-3 py-2 text-sm"
                      onClick={() => setChordSize((v) => Math.min(18, v + 1))}
                      title="Aumentar cifra"
                    >
                      c+
                    </button>
                  </div>
                </div>
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
                  title="Voltar ao tom salvo"
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
        ) : null}
      </div>

      {loading ? (
        <div className="mt-3 text-sm opacity-70">Carregando...</div>
      ) : null}

      {!loading && !parts.length ? (
        <div className="mt-3 text-sm opacity-70">Essa cifra não tem conteúdo (parts) ainda.</div>
      ) : null}

      {/* ✅ banana-style: sem cards, sem borda, fluxo contínuo */}
      <div className="mt-3">
        {parts.map((part, partIdx) => (
          <section key={`${part.type}-${partIdx}`} className="mb-5">
            {/* cabeçalho do trecho */}
            <div className="mb-2 flex items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
                [{partLabel(part)}]
              </div>
              <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            </div>

            <div>
              {part.lines.map((line, lineIdx) => {
                const tokensShown = transposeChordTokens(
                  line.chords ?? [],
                  transpose,
                  accidentalPref
                );

                const chordOverlay = showChords
                  ? buildChordOverlay(line.lyric ?? "", tokensShown)
                  : "";

                return (
                  <div key={lineIdx} className="mb-3">
                    {/* linha de cifra (compacta e colada) */}
                    {chordOverlay ? (
                      <div
                        className="whitespace-pre font-mono opacity-90 overflow-hidden"
                        style={{
                          fontSize: chordSize,
                          lineHeight: chordLineHeight,
                          marginBottom: tight ? 2 : 6,
                        }}
                      >
                        {chordOverlay}
                      </div>
                    ) : null}

                    {/* linha de letra — importante: NÃO quebrar linha (pra não bagunçar a coluna) */}
                    <div
                      className="whitespace-pre font-mono overflow-hidden"
                      style={{
                        fontSize,
                        lineHeight: lyricLineHeight,
                      }}
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
    </main>
  );
}