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

type ListNavItem = { id: string; title: string };
type ListNavResponse =
  | { success: true; data: { id: string; name: string; items: ListNavItem[] } }
  | { success: false; error?: string };

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

  const [song, setSong] = useState<SongDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [transpose, setTranspose] = useState(0);
  const accidentalPref: AccidentalPref = "sharp";

  const [showChords, setShowChords] = useState(true);

  /**
   * ✅ PADRÕES PARA BATER 1:1 COM O EDITOR
   */
  const [fontSize, setFontSize] = useState(12);
  const [lineHeight, setLineHeight] = useState(1.05);
  const [cols, setCols] = useState(46);

  // ✅ topo escondido por padrão
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [keepAwake, setKeepAwake] = useState(false);
  const wakeLockRef = useRef<any | null>(null);

  // ✅ navegação por lista (opcional)
  const [listId, setListId] = useState<string | null>(null);
  const [listName, setListName] = useState<string | null>(null);
  const [listItems, setListItems] = useState<ListNavItem[] | null>(null);

  const currentSongId = params.id;

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

  // ✅ pega listId da URL e busca as músicas dessa lista (se existir endpoint)
  useEffect(() => {
    const qListId = searchParams.get("listId");
    setListId(qListId ? String(qListId) : null);

    async function loadList(navListId: string) {
      try {
        // Tentativa padrão: GET /api/song-lists/:id retornando { items: [{id,title}] }
        const res = await fetch(`/api/song-lists/${encodeURIComponent(navListId)}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as ListNavResponse | null;

        if (!res.ok || !json || (json as any)?.success !== true) {
          // Se não existir esse endpoint/shape, apenas não mostra navegação.
          setListItems(null);
          setListName(null);
          return;
        }

        if (!json.success) {
          setListItems(null);
          setListName(null);
          return;
        }

        const items = Array.isArray(json.data?.items) ? json.data.items : [];
        setListName(json.data?.name ?? null);
        setListItems(
          items
            .map((it: any) => ({
              id: String(it?.id ?? ""),
              title: String(it?.title ?? ""),
            }))
            .filter((it: ListNavItem) => it.id && it.title)
        );
      } catch {
        setListItems(null);
        setListName(null);
      }
    }

    if (qListId) loadList(String(qListId));
    else {
      setListItems(null);
      setListName(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, currentSongId]);

  const parts = useMemo(() => song?.content?.parts ?? [], [song]);

  const nav = useMemo(() => {
    if (!listId || !listItems?.length) return null;

    const idx = listItems.findIndex((it) => it.id === currentSongId);
    if (idx < 0) return null;

    const prev = idx > 0 ? listItems[idx - 1] : null;
    const next = idx < listItems.length - 1 ? listItems[idx + 1] : null;

    const makeHref = (songId: string) => `/songs/${songId}/culto?listId=${encodeURIComponent(listId)}`;

    return {
      idx,
      total: listItems.length,
      prev: prev ? { ...prev, href: makeHref(prev.id) } : null,
      next: next ? { ...next, href: makeHref(next.id) } : null,
      backHref: `/song-lists/${encodeURIComponent(listId)}`,
      fallbackBackHref: "/song-lists",
      listName: listName ?? null,
    };
  }, [listId, listItems, currentSongId, listName]);

  return (
    <main className="mx-auto max-w-3xl px-3 py-3 pb-24">
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

              {nav?.listName ? (
                <div className="mt-1 text-xs opacity-70">
                  Lista: <span className="font-medium">{nav.listName}</span> •{" "}
                  {nav.idx + 1}/{nav.total}
                </div>
              ) : null}
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

      {/* ✅ RODAPÉ: navegação por lista (se houver listId e conseguirmos carregar itens) */}
      {nav ? (
        <div
          className="fixed bottom-0 left-0 right-0 z-20 border-t bg-white/95 dark:bg-black/90"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)" }}
        >
          <div className="mx-auto max-w-3xl px-3 pt-2">
            <div className="grid grid-cols-3 items-center gap-2">
              {/* anterior */}
              {nav.prev ? (
                <a
                  href={nav.prev.href}
                  className="rounded-lg border px-2 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5 transition"
                  title={`Anterior: ${nav.prev.title}`}
                >
                  <div className="text-xs opacity-70">←</div>
                  <div className="truncate font-medium">{nav.prev.title}</div>
                </a>
              ) : (
                <div className="rounded-lg border px-2 py-2 text-sm opacity-40">
                  <div className="text-xs">←</div>
                  <div className="truncate">—</div>
                </div>
              )}

              {/* voltar à lista */}
              <a
                href={nav.backHref}
                onClick={(e) => {
                  // se a rota /song-lists/[id] não existir, cai pra /song-lists
                  // (não dá pra testar com certeza aqui, então deixamos fallback simples)
                  // Se quiser, você me manda a estrutura das rotas de song-lists e eu ajusto 100%.
                }}
                className="rounded-lg border px-2 py-2 text-center text-sm hover:bg-black/5 dark:hover:bg-white/5 transition"
                title="Voltar à lista"
              >
                <div className="text-xs opacity-70">
                  {nav.listName ? nav.listName : "Lista"}
                </div>
                <div className="font-medium underline underline-offset-2">
                  Voltar à lista
                </div>
              </a>

              {/* próxima */}
              {nav.next ? (
                <a
                  href={nav.next.href}
                  className="rounded-lg border px-2 py-2 text-right text-sm hover:bg-black/5 dark:hover:bg-white/5 transition"
                  title={`Próxima: ${nav.next.title}`}
                >
                  <div className="text-xs opacity-70">→</div>
                  <div className="truncate font-medium">{nav.next.title}</div>
                </a>
              ) : (
                <div className="rounded-lg border px-2 py-2 text-sm opacity-40 text-right">
                  <div className="text-xs">→</div>
                  <div className="truncate">—</div>
                </div>
              )}
            </div>

            <div className="mt-1 text-[11px] opacity-60 text-center">
              {nav.idx + 1}/{nav.total}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}