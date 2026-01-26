"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "next/navigation";
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

type NavMini = { id: string; title: string };
type NavState = {
  listId: string;
  listName?: string;
  prev?: NavMini | null;
  next?: NavMini | null;
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
  const searchParams = useSearchParams();
  const listIdFromUrl = (searchParams?.get("listId") ?? "").trim();

  const [song, setSong] = useState<SongDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [transpose, setTranspose] = useState(0);
  const accidentalPref: AccidentalPref = "sharp";

  const [showChords, setShowChords] = useState(true);

  /**
   * ✅ PADRÕES
   */
  const [fontSize, setFontSize] = useState(12);
  const [lineHeight, setLineHeight] = useState(1.05);
  const [cols, setCols] = useState(46);

  // ✅ topo escondido por padrão
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [keepAwake, setKeepAwake] = useState(false);
  const wakeLockRef = useRef<any | null>(null);

  // ✅ navegação por lista (opcional)
  const [nav, setNav] = useState<NavState | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/songs/${params.id}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json?.success) throw new Error(json?.error || "Erro ao buscar cifra");
    setSong(json.data);
    setLoading(false);
  }

  async function loadNav(listId: string, currentSongId: string) {
    try {
      const res = await fetch(`/api/song-lists/${encodeURIComponent(listId)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "Erro ao buscar lista");

      const items = (json?.data?.items ?? []) as Array<{
        song: { id: string; title: string };
        order?: number;
      }>;

      const idx = items.findIndex((it) => it?.song?.id === currentSongId);
      if (idx === -1) {
        setNav({
          listId,
          listName: json?.data?.name ?? undefined,
          prev: null,
          next: null,
        });
        return;
      }

      const prevItem = idx > 0 ? items[idx - 1]?.song : null;
      const nextItem = idx < items.length - 1 ? items[idx + 1]?.song : null;

      setNav({
        listId,
        listName: json?.data?.name ?? undefined,
        prev: prevItem ? { id: prevItem.id, title: prevItem.title } : null,
        next: nextItem ? { id: nextItem.id, title: nextItem.title } : null,
      });
    } catch (e: any) {
      // não trava a página por causa de navegação
      setNav(null);
    }
  }

  useEffect(() => {
    load().catch((e: any) => {
      toast.error(e?.message || "Erro ao carregar");
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // quando tiver listId, carrega nav (e atualiza quando trocar de música)
  useEffect(() => {
    if (!listIdFromUrl) {
      setNav(null);
      return;
    }
    loadNav(listIdFromUrl, params.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listIdFromUrl, params.id]);

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

  const hasFooterNav = !!(nav?.listId && (nav.prev || nav.next));

  function cultoHref(songId: string) {
    const base = `/songs/${songId}/culto`;
    if (!nav?.listId) return base;
    return `${base}?listId=${encodeURIComponent(nav.listId)}`;
  }

  function backToListHref() {
    if (!nav?.listId) return "/song-lists";
    return `/song-lists/${encodeURIComponent(nav.listId)}`;
  }

  return (
    <main className={`mx-auto max-w-3xl px-3 py-3 ${hasFooterNav ? "pb-24" : ""}`}>
      {/* ✅ Botão flutuante */}
      <button
        className="fixed right-3 top-3 z-20 rounded-full border bg-white/95 dark:bg-black/90 w-11 h-11 flex items-center justify-center shadow-sm"
        onClick={() => setSettingsOpen((v) => !v)}
        title="Ajustes"
        aria-label="Ajustes"
      >
        ⚙️
      </button>

      {/* ✅ Painel de ajustes */}
      {settingsOpen ? (
        <div className="mb-3 rounded-xl border p-3 bg-white/95 dark:bg-black/95">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <a className="text-sm opacity-70 underline" href="/songs">
                ← Voltar para Cifras
              </a>

              <div className="mt-1 text-lg font-semibold truncate">
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
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={() => setSettingsOpen(false)}
              title="Fechar"
            >
              Fechar
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={() => setShowChords((v) => !v)}
              title="Mostrar/ocultar cifras"
            >
              {showChords ? "Cifras ✓" : "Cifras ✗"}
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
              onClick={() => setFontSize((v) => Math.max(8, v - 1))}
              title="Diminuir fonte"
            >
              A-
            </button>
            <button
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={() => setFontSize((v) => Math.min(18, v + 1))}
              title="Aumentar fonte"
            >
              A+
            </button>

            <button
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={() =>
                setLineHeight((v) => Math.max(1.05, Number((v - 0.03).toFixed(2))))
              }
              title="Menos espaçamento"
            >
              Linhas ⇣
            </button>
            <button
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={() =>
                setLineHeight((v) => Math.min(1.45, Number((v + 0.03).toFixed(2))))
              }
              title="Mais espaçamento"
            >
              Linhas ⇡
            </button>

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
          </div>

          <div className="mt-2 text-xs opacity-70">
            {cols} cols • lh {lineHeight.toFixed(2)} • fonte {fontSize}px
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="border rounded p-3 text-sm opacity-70">Carregando...</div>
      ) : null}

      {!loading && !parts.length ? (
        <div className="border rounded p-3 text-sm opacity-70">
          Essa cifra não tem conteúdo (parts) ainda.
        </div>
      ) : null}

      {/* ✅ CONTEÚDO */}
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
                              color: "#2563EB",
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

      {/* ✅ Rodapé de navegação (quando veio de uma lista) */}
      {nav?.listId ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 dark:bg-black/90">
          <div className="mx-auto max-w-3xl px-3 py-3">
            <div className="grid grid-cols-3 items-center gap-2">
              {/* Anterior */}
              <div className="min-w-0">
                {nav.prev ? (
                  <a
                    href={cultoHref(nav.prev.id)}
                    className="block rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    title={`Ir para: ${nav.prev.title}`}
                  >
                    <div className="text-[11px] opacity-60">← Anterior</div>
                    <div className="truncate font-medium">{nav.prev.title}</div>
                  </a>
                ) : (
                  <div className="rounded-lg border px-3 py-2 text-sm opacity-40">
                    <div className="text-[11px]">← Anterior</div>
                    <div className="truncate">—</div>
                  </div>
                )}
              </div>

              {/* Voltar à lista */}
              <div className="flex justify-center">
                <a
                  href={backToListHref()}
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                  title="Voltar à lista"
                >
                  Voltar à lista
                </a>
              </div>

              {/* Próxima */}
              <div className="min-w-0">
                {nav.next ? (
                  <a
                    href={cultoHref(nav.next.id)}
                    className="block rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 text-right"
                    title={`Ir para: ${nav.next.title}`}
                  >
                    <div className="text-[11px] opacity-60">Próxima →</div>
                    <div className="truncate font-medium">{nav.next.title}</div>
                  </a>
                ) : (
                  <div className="rounded-lg border px-3 py-2 text-sm opacity-40 text-right">
                    <div className="text-[11px]">Próxima →</div>
                    <div className="truncate">—</div>
                  </div>
                )}
              </div>
            </div>

            {nav.listName ? (
              <div className="mt-2 text-[11px] opacity-60 truncate">
                Lista: <span className="font-medium">{nav.listName}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}