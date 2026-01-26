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

/**
 * ✅ “Wrap sincronizado” (bananacifras-like):
 * quebra lyric e overlay em blocos do mesmo tamanho (cols),
 * renderizando acorde em cima + letra embaixo para cada chunk.
 *
 * Isso evita:
 * - cifra ficar “em outra caixa”
 * - overflow horizontal
 * - letra quebrar sem a cifra acompanhar
 */
function renderWrappedChordLyric({
  lyric,
  overlay,
  cols,
  showChords,
  fontSize,
  lineHeight,
}: {
  lyric: string;
  overlay: string;
  cols: number;
  showChords: boolean;
  fontSize: number;
  lineHeight: number;
}) {
  const safeCols = Math.max(18, Math.min(cols, 120));

  // preserva espaços internos, mas permite wrap por chunks
  const l = String(lyric ?? "");
  const o = String(overlay ?? "");

  const maxLen = Math.max(l.length, o.length);
  const total = Math.max(1, maxLen);

  const rows: Array<{ c: string; t: string }> = [];

  for (let i = 0; i < total; i += safeCols) {
    const t = l.slice(i, i + safeCols);
    const c = o.slice(i, i + safeCols);

    // evita gerar “linhas vazias” duplicadas
    const tTrim = t.replace(/\s/g, "");
    const cTrim = c.replace(/\s/g, "");

    if (!tTrim && !cTrim) continue;

    rows.push({ c, t });
  }

  return (
    <div>
      {rows.map((r, idx) => (
        <div key={idx}>
          {showChords && r.c.trim() ? (
            <div
              className="whitespace-pre font-mono opacity-90"
              style={{
                fontSize: Math.max(11, fontSize - 4),
                lineHeight: Math.max(1.0, lineHeight - 0.2),
              }}
            >
              {r.c}
            </div>
          ) : null}

          <div
            className="whitespace-pre font-mono"
            style={{ fontSize, lineHeight }}
          >
            {r.t}
          </div>
        </div>
      ))}
    </div>
  );
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Heurística de colunas (cols) baseada na largura da tela:
 * Ajustável pelo usuário (⇤/⇥) para “cabem mais acordes” sem quebrar feio.
 */
function estimateCols() {
  if (typeof window === "undefined") return 42;

  const w = window.innerWidth;
  // aproximando: 1 coluna ~ 9-10px num mono pequeno.
  // - em celular 360px -> ~36-40 cols
  // - em tablet 768px -> ~72-80 cols
  const base = Math.floor(w / 9);
  return clamp(base, 28, 96);
}

export default function SongCultoPage({ params }: { params: { id: string } }) {
  const [song, setSong] = useState<SongDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [transpose, setTranspose] = useState(0);
  const accidentalPref: AccidentalPref = "sharp";

  // controles do modo culto
  const [showChords, setShowChords] = useState(true);

  // tipografia bananacifras-like (mais compacto)
  const [fontSize, setFontSize] = useState(18); // px
  const [lineHeight, setLineHeight] = useState(1.35);

  // ✅ largura em colunas para wrap sincronizado
  const [cols, setCols] = useState(estimateCols());

  // wake lock
  const [keepAwake, setKeepAwake] = useState(false);
  const wakeLockRef = useRef<any | null>(null);

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

  // recalcular cols ao mudar orientação/tamanho
  useEffect(() => {
    function onResize() {
      setCols((prev) => {
        const next = estimateCols();
        // se o usuário já ajustou manualmente muito, respeita mais o manual.
        // aqui fazemos um ajuste suave apenas se estiver “perto”
        if (Math.abs(next - prev) <= 10) return next;
        return prev;
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
    <main className="mx-auto max-w-3xl px-3 pb-10 pt-3">
      {/* Top bar compacta */}
      <div className="sticky top-0 z-10 -mx-3 px-3 py-2 bg-white/92 dark:bg-black/92 backdrop-blur border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a className="text-xs opacity-70 underline" href={`/songs/${params.id}`}>
              ← Voltar
            </a>

            <div className="mt-1 text-lg font-semibold truncate">
              {song?.title ?? "Cifra"}
            </div>

            <div className="text-xs opacity-80">
              {song?.artist ? `${song.artist} • ` : ""}
              Tom: <strong>{song?.originalKey ?? "-"}</strong>
              {transpose !== 0 ? (
                <>
                  {" "}
                  • Transp.:{" "}
                  <span className="font-mono">{transpose > 0 ? `+${transpose}` : transpose}</span>
                </>
              ) : null}
            </div>

            {/* Controles compactos */}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="rounded-md border px-2 py-1 text-xs"
                onClick={() => setShowChords((v) => !v)}
                title="Mostrar/ocultar cifras"
              >
                {showChords ? "Cifras ✓" : "Cifras ✕"}
              </button>

              <button
                className="rounded-md border px-2 py-1 text-xs"
                onClick={() => setKeepAwake((v) => !v)}
                title="Tentar manter a tela ligada"
              >
                {keepAwake ? "Tela ✓" : "Tela"}
              </button>

              <div className="flex gap-2">
                <button
                  className="rounded-md border px-2 py-1 text-xs"
                  onClick={() => setFontSize((v) => clamp(v - 1, 14, 30))}
                  title="Diminuir fonte"
                >
                  A-
                </button>
                <button
                  className="rounded-md border px-2 py-1 text-xs"
                  onClick={() => setFontSize((v) => clamp(v + 1, 14, 30))}
                  title="Aumentar fonte"
                >
                  A+
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  className="rounded-md border px-2 py-1 text-xs"
                  onClick={() => setLineHeight((v) => clamp(Number((v - 0.05).toFixed(2)), 1.15, 1.9))}
                  title="Menos espaçamento"
                >
                  ⇣
                </button>
                <button
                  className="rounded-md border px-2 py-1 text-xs"
                  onClick={() => setLineHeight((v) => clamp(Number((v + 0.05).toFixed(2)), 1.15, 1.9))}
                  title="Mais espaçamento"
                >
                  ⇡
                </button>
              </div>

              {/* ✅ Ajuste de “largura” (colunas) para caber melhor */}
              <div className="flex gap-2">
                <button
                  className="rounded-md border px-2 py-1 text-xs"
                  onClick={() => setCols((v) => clamp(v - 4, 28, 96))}
                  title="Menos colunas (quebra mais cedo)"
                >
                  ⇤
                </button>
                <button
                  className="rounded-md border px-2 py-1 text-xs"
                  onClick={() => setCols((v) => clamp(v + 4, 28, 96))}
                  title="Mais colunas (quebra menos)"
                >
                  ⇥
                </button>
                <span className="text-[11px] opacity-70 self-center">
                  {cols} cols
                </span>
              </div>
            </div>
          </div>

          {/* transposição */}
          <div className="flex gap-2">
            <button
              className="rounded-md border px-2 py-1 text-xs"
              onClick={() => setTranspose((v) => v - 1)}
              title="Transpor -1"
            >
              -1
            </button>
            <button
              className="rounded-md border px-2 py-1 text-xs"
              onClick={() => setTranspose(0)}
              title="Voltar ao tom salvo"
            >
              0
            </button>
            <button
              className="rounded-md border px-2 py-1 text-xs"
              onClick={() => setTranspose((v) => v + 1)}
              title="Transpor +1"
            >
              +1
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 text-sm opacity-70">Carregando...</div>
      ) : null}

      {!loading && !parts.length ? (
        <div className="mt-4 text-sm opacity-70">
          Essa cifra não tem conteúdo (parts) ainda.
        </div>
      ) : null}

      {/* Conteúdo (flat) */}
      <div className="mt-4 space-y-6">
        {parts.map((part, partIdx) => (
          <section key={`${part.type}-${partIdx}`} className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
              {partLabel(part)}
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
                  <div key={lineIdx} className="px-0">
                    {renderWrappedChordLyric({
                      lyric: line.lyric ?? "",
                      overlay: chordOverlay,
                      cols,
                      showChords,
                      fontSize,
                      lineHeight,
                    })}
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