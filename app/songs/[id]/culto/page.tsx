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

function rtrim(s: string) {
  return s.replace(/\s+$/g, "");
}

function padRight(s: string, len: number) {
  if (s.length >= len) return s;
  return s + " ".repeat(len - s.length);
}

/**
 * ✅ Quebra por COLUNAS (cols) e mantém cifra+letra sempre alinhadas.
 * (a cifra acompanha a letra na quebra)
 */
function wrapAligned(
  lyric: string,
  overlay: string,
  cols: number
): Array<{ chordLine: string; lyricLine: string }> {
  const maxLen = Math.max(lyric.length, overlay.length);
  const lyricPad = padRight(lyric, maxLen);
  const overlayPad = padRight(overlay, maxLen);

  const out: Array<{ chordLine: string; lyricLine: string }> = [];

  const safeCols = Math.max(10, Math.min(200, Math.floor(cols || 40)));

  for (let i = 0; i < maxLen; i += safeCols) {
    const chordSeg = overlayPad.slice(i, i + safeCols);
    const lyricSeg = lyricPad.slice(i, i + safeCols);

    if (!rtrim(chordSeg) && !rtrim(lyricSeg)) continue;

    out.push({
      chordLine: rtrim(chordSeg),
      lyricLine: rtrim(lyricSeg),
    });
  }

  return out;
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

  const [showChords, setShowChords] = useState(true);

  /**
   * ✅ Fonte padrão do culto (-4 pontos)
   * Importante: 1 ÚNICO fontSize para cifra+letra, pra não quebrar o alinhamento.
   */
  const [fontSize, setFontSize] = useState(12);
  const [lineHeight, setLineHeight] = useState(1.15);
  const [cols, setCols] = useState(45);

  const [settingsOpen, setSettingsOpen] = useState(false);

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
    <main className="mx-auto max-w-3xl px-3 py-3">
      {/* ✅ TOPO (limpo): Voltar + título + ⚙️ */}
      <div className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* ✅ volta pro MENU cifra */}
            <a className="text-sm opacity-70 underline" href="/songs">
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
          </div>

          <button
            className="rounded-full border w-10 h-10 flex items-center justify-center"
            onClick={() => setSettingsOpen((v) => !v)}
            title="Configurações"
            aria-label="Abrir configurações"
          >
            ⚙️
          </button>
        </div>

        {/* ✅ Painel escondido (⚙️) — agora aqui dentro fica a transposição */}
        {settingsOpen ? (
          <div className="mt-3 rounded-xl border p-3 bg-white/95 dark:bg-black/95">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {/* cifras */}
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() => setShowChords((v) => !v)}
                title="Mostrar/ocultar cifras"
              >
                {showChords ? "Cifras ✓" : "Cifras ✗"}
              </button>

              {/* wake lock */}
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() => setKeepAwake((v) => !v)}
                title="Tentar manter a tela ligada"
              >
                {keepAwake ? "Tela ✓" : "Tela"}
              </button>

              {/* fonte (um controle só) */}
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() => setFontSize((v) => Math.max(10, v - 2))}
                title="Diminuir fonte"
              >
                A-
              </button>
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() => setFontSize((v) => Math.min(28, v + 2))}
                title="Aumentar fonte"
              >
                A+
              </button>

              {/* line height */}
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() =>
                  setLineHeight((v) => Math.max(1.1, Number((v - 0.05).toFixed(2))))
                }
                title="Menos espaçamento"
              >
                Linhas ⇣
              </button>
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() =>
                  setLineHeight((v) => Math.min(1.8, Number((v + 0.05).toFixed(2))))
                }
                title="Mais espaçamento"
              >
                Linhas ⇡
              </button>

              {/* cols */}
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() => setCols((v) => Math.max(20, v - 2))}
                title="Menos colunas"
              >
                Cols ←
              </button>
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() => setCols((v) => Math.min(90, v + 2))}
                title="Mais colunas"
              >
                Cols →
              </button>

              {/* ✅ Transposição agora fica aqui dentro */}
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
                className="rounded-lg border px-3 py-2 text-sm col-span-2 sm:col-span-1"
                onClick={() => setTranspose((v) => v + 1)}
                title="Transpor +1"
              >
                +1
              </button>

              <button
                className="rounded-lg border px-3 py-2 text-sm col-span-2 sm:col-span-3"
                onClick={() => setSettingsOpen(false)}
                title="Fechar"
              >
                Fechar
              </button>
            </div>

            <div className="mt-2 text-xs opacity-70">
              {cols} cols • lh {lineHeight.toFixed(2)} • fonte {fontSize}px
            </div>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="border rounded p-3 text-sm opacity-70">Carregando...</div>
      ) : null}

      {!loading && !parts.length ? (
        <div className="border rounded p-3 text-sm opacity-70">
          Essa cifra não tem conteúdo (parts) ainda.
        </div>
      ) : null}

      {/* ✅ CONTEÚDO (estilo banana-cifras: compacto, sem cards por linha) */}
      <div className="space-y-5">
        {parts.map((part, partIdx) => (
          <section key={`${part.type}-${partIdx}`} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
                {partLabel(part)}
              </div>
              <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            </div>

            <div className="space-y-2">
              {part.lines.map((line, lineIdx) => {
                const base = line.chords ?? [];
                const shown = transposeChordTokens(base, transpose, accidentalPref);

                const overlay = showChords ? buildChordOverlay(line.lyric ?? "", shown) : "";
                const wrapped = wrapAligned(line.lyric ?? "", overlay, cols);

                return (
                  <div key={lineIdx}>
                    {wrapped.map((seg, i) => (
                      <div key={`${lineIdx}-${i}`}>
                        {showChords && seg.chordLine ? (
                          <div
                            className="whitespace-pre font-mono font-semibold"
                            style={{
                              fontSize,
                              lineHeight,
                              color: "#2563EB", // azul (blue-600)
                            }}
                          >
                            {seg.chordLine}
                          </div>
                        ) : null}

                        <div
                          className="whitespace-pre font-mono"
                          style={{ fontSize, lineHeight }}
                        >
                          {seg.lyricLine}
                        </div>
                      </div>
                    ))}

                    {/* espaçozinho bem pequeno entre blocos */}
                    <div style={{ height: 6 }} />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 text-xs opacity-60">
        ID: <span className="font-mono">{song?.id ?? params.id}</span>
      </div>
    </main>
  );
}