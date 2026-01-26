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

  // ✅ modo culto: defaults mais “tocáveis”
  const [showChords, setShowChords] = useState(true);
  const [fontSize, setFontSize] = useState(16); // ↓ menor por padrão
  const [lineHeight, setLineHeight] = useState(1.35); // ↓ mais compacto por padrão

  // ✅ wake lock
  const [keepAwake, setKeepAwake] = useState(false);
  const wakeLockRef = useRef<any | null>(null);

  // ✅ barra superior “escondida” por padrão
  const [controlsOpen, setControlsOpen] = useState(false);

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

  return (
    <main className="mx-auto max-w-4xl p-4">
      {/* ✅ Botão flutuante para abrir/fechar controles (barra escondida por padrão) */}
      <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
        <button
          type="button"
          className="rounded-full border bg-white/90 backdrop-blur px-3 py-2 text-sm shadow-sm hover:bg-white"
          onClick={() => setControlsOpen((v) => !v)}
          title={controlsOpen ? "Fechar controles" : "Abrir controles"}
        >
          ⚙️
        </button>
      </div>

      {/* ✅ Painel de controles (colapsável) */}
      {controlsOpen ? (
        <div className="sticky top-0 z-40 mb-4 rounded-xl border bg-white/90 backdrop-blur p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <a className="text-sm opacity-70 underline" href={`/songs/${params.id}`}>
                ← Voltar
              </a>

              <div className="mt-1 text-xl font-semibold truncate">
                {song?.title ?? "Cifra"}
              </div>
              <div className="text-sm opacity-80">
                {song?.artist ? `${song.artist} • ` : ""}
                Tom salvo: <strong>{song?.originalKey ?? "-"}</strong>
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

              <div className="mt-3 flex flex-wrap gap-2">
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

                <div className="flex gap-2">
                  <button
                    className="rounded-lg border px-3 py-2 text-sm"
                    onClick={() => setFontSize((v) => Math.max(12, v - 1))}
                    title="Diminuir fonte"
                  >
                    A-
                  </button>
                  <button
                    className="rounded-lg border px-3 py-2 text-sm"
                    onClick={() => setFontSize((v) => Math.min(28, v + 1))}
                    title="Aumentar fonte"
                  >
                    A+
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    className="rounded-lg border px-3 py-2 text-sm"
                    onClick={() =>
                      setLineHeight((v) => Math.max(1.15, Number((v - 0.05).toFixed(2))))
                    }
                    title="Menos espaçamento"
                  >
                    ⇣
                  </button>
                  <button
                    className="rounded-lg border px-3 py-2 text-sm"
                    onClick={() =>
                      setLineHeight((v) => Math.min(1.9, Number((v + 0.05).toFixed(2))))
                    }
                    title="Mais espaçamento"
                  >
                    ⇡
                  </button>
                </div>

                <button
                  className="rounded-lg border px-3 py-2 text-sm"
                  onClick={() => setControlsOpen(false)}
                  title="Fechar controles"
                >
                  Fechar
                </button>
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

      {loading ? (
        <div className="border rounded p-4 text-sm opacity-70">Carregando...</div>
      ) : null}

      {!loading && !parts.length ? (
        <div className="border rounded p-4 text-sm opacity-70">
          Essa cifra não tem conteúdo (parts) ainda.
        </div>
      ) : null}

      {/* ✅ Conteúdo: mais compacto, menos “caixa”, mais tocar/rolar */}
      <div className="space-y-7">
        {parts.map((part, partIdx) => (
          <section key={`${part.type}-${partIdx}`} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
                {partLabel(part)}
              </div>
              <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            </div>

            <div className="space-y-3">
              {part.lines.map((line, lineIdx) => {
                const transposedTokens = transposeChordTokens(
                  line.chords ?? [],
                  transpose,
                  accidentalPref
                );

                const chordOverlay = showChords
                  ? buildChordOverlay(line.lyric ?? "", transposedTokens)
                  : "";

                return (
                  <div key={lineIdx} className="rounded-lg border p-3">
                    {chordOverlay ? (
                      <div
                        className="whitespace-pre font-mono opacity-90"
                        style={{
                          fontSize: Math.max(11, fontSize - 3),
                          lineHeight,
                        }}
                      >
                        {chordOverlay}
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
    </main>
  );
}