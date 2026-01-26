"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import type { SongDetail } from "./page";
import ChordPicker from "./ChordPicker";
import { transposeChord, transposeChordTokens, type AccidentalPref } from "@/lib/chords";

type SongChordToken = { chord: string; pos: number };
type SongLine = { lyric: string; chords: SongChordToken[] };
type SongPart = { type: string; title?: string | null; lines: SongLine[] };

const KEY_OPTIONS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"] as const;

function normKey(k?: string | null) {
  return String(k ?? "").trim().toUpperCase();
}

function keyToSemitone(key: string) {
  const k = normKey(key);
  const map: Record<string, number> = {
    C: 0, "C#": 1, DB: 1,
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

function transposePartsToNewBase(partsBase: SongPart[], semitones: number, accidentalPref: AccidentalPref): SongPart[] {
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

function rtrim(s: string) {
  return s.replace(/\s+$/g, "");
}

function padRight(s: string, len: number) {
  if (s.length >= len) return s;
  return s + " ".repeat(len - s.length);
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

/**
 * ✅ Mesmo WRAP do culto:
 * quebra por COLUNAS e mantém “grade” de caracteres.
 */
function wrapAlignedWithRanges(
  lyric: string,
  overlay: string,
  cols: number
): Array<{ start: number; end: number; chordLine: string; lyricLine: string }> {
  const maxLen = Math.max(lyric.length, overlay.length);
  const lyricPad = padRight(lyric, maxLen);
  const overlayPad = padRight(overlay, maxLen);

  const out: Array<{ start: number; end: number; chordLine: string; lyricLine: string }> = [];

  const safeCols = Math.max(10, Math.min(200, Math.floor(cols || 40)));

  for (let i = 0; i < maxLen; i += safeCols) {
    const chordSeg = overlayPad.slice(i, i + safeCols);
    const lyricSeg = lyricPad.slice(i, i + safeCols);

    if (!rtrim(chordSeg) && !rtrim(lyricSeg)) continue;

    out.push({
      start: i,
      end: Math.min(i + safeCols, maxLen),
      chordLine: rtrim(chordSeg),
      lyricLine: rtrim(lyricSeg),
    });
  }

  return out;
}

export default function SongViewer({ song }: { song: SongDetail }) {
  const router = useRouter();

  const [transpose, setTranspose] = useState(0);
  const accidentalPref: AccidentalPref = "sharp";
  const [savedOriginalKey, setSavedOriginalKey] = useState(song.originalKey);

  // ✅ colunas fixas (para bater 1:1 com o Culto padrão)
  // (depois, se quiser, a gente sincroniza isso com o Culto via storage)
  const [cols] = useState(40);

  // ✅ fonte única para cifra+letra (para 'ch' bater 1:1)
  const [fontSize] = useState(14);
  const [lineHeight] = useState(1.25);

  // ✅ transposição fica “escondida” em ajustes
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ✅ sempre ALINHADO (editar)
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

  const [moveTarget, setMoveTarget] = useState<{
    partIdx: number;
    lineIdx: number;
    chordIdx: number;
  } | null>(null);

  const parts = useMemo(() => partsBase ?? [], [partsBase]);

  function openPicker(partIdx: number, lineIdx: number, chordIdx: number, chordShown: string) {
    setSelected({ partIdx, lineIdx, chordIdx, displayChord: chordShown });
    setPickerOpen(true);
  }

  function applyPickedChord(newChordShown: string) {
    if (!selected) return;

    const newChordBase =
      transpose !== 0 ? transposeChord(newChordShown, -transpose, accidentalPref) : newChordShown;

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
      {/* Topo alinhado e limpo */}
      <div className="mb-4 rounded-xl border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <button className="text-sm underline opacity-70" onClick={handleBack}>
                ← Voltar
              </button>
              <Link className="text-sm underline opacity-70" href="/songs">
                Cifras
              </Link>
            </div>

            <h1 className="mt-2 text-2xl font-semibold truncate">{song.title}</h1>

            <div className="text-sm opacity-80">
              {song.artist ? `${song.artist} • ` : ""}
              Tom salvo: <strong>{savedOriginalKey}</strong>
              {transpose !== 0 ? (
                <>
                  {" "}
                  • Após salvar: <strong>{transposeKey(savedOriginalKey, transpose)}</strong> • Transp.:{" "}
                  <span className="font-mono">{transpose > 0 ? `+${transpose}` : transpose}</span>
                </>
              ) : null}
            </div>

            <div className="mt-2 text-sm opacity-70">
              {dirty ? "Alterações pendentes." : "Tudo salvo."}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/songs/import"
              className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 transition"
              title="Importar uma cifra"
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
              onClick={handleSave}
              disabled={!dirty}
              title={dirty ? "Salvar alterações" : "Nada para salvar"}
            >
              Salvar
            </button>

            <button
              className="rounded-full border w-10 h-10 flex items-center justify-center"
              onClick={() => setSettingsOpen((v) => !v)}
              title="Ajustes"
              aria-label="Ajustes"
            >
              ⚙️
            </button>
          </div>
        </div>

        {settingsOpen ? (
          <div className="mt-3 rounded-xl border p-3 bg-white/95 dark:bg-black/95">
            <div className="flex flex-wrap items-center gap-2">
              {/* Transposição escondida aqui */}
              <div className="text-xs opacity-70 mr-2">Transposição:</div>
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

              <div className="ml-auto text-xs opacity-60">
                colunas: {cols} • fonte: {fontSize}px
              </div>

              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() => setSettingsOpen(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-3 text-xs opacity-60">
          Dica: toque no acorde para selecionar; use ◀ ▶ para mover a posição. O editor usa o MESMO wrap/colunas do culto.
        </div>
      </div>

      <div className="space-y-6">
        {parts.map((part, partIdx) => (
          <section key={`${part.type}-${partIdx}`} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{partLabel(part)}</div>
              <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            </div>

            <div className="space-y-4">
              {part.lines.map((line, lineIdx) => {
                const base = line.chords ?? [];
                const shown = transposeChordTokens(base, transpose, accidentalPref);

                const overlay = buildChordOverlay(line.lyric ?? "", shown);
                const wrapped = wrapAlignedWithRanges(line.lyric ?? "", overlay, cols);

                return (
                  <div key={lineIdx} className="rounded-lg border p-3">
                    <div className="space-y-1">
                      {wrapped.map((seg, segIdx) => {
                        // acordes que caem dentro desse segmento (pela POS original)
                        const chordsInSeg = shown
                          .map((t, idx) => ({ t, idx }))
                          .filter(({ t }) => {
                            const p = Math.max(0, Number(t.pos ?? 0));
                            return p >= seg.start && p < seg.end;
                          });

                        return (
                          <div key={`${lineIdx}-${segIdx}`} className="space-y-0.5">
                            {/* Linha de acordes: posição por (pos-start)ch */}
                            <div
                              className="relative font-mono overflow-hidden"
                              style={{
                                height: Math.ceil(fontSize * lineHeight),
                                fontSize,
                                lineHeight,
                              }}
                            >
                              {chordsInSeg.map(({ t, idx }) => {
                                const leftCh = Math.max(0, Number(t.pos ?? 0) - seg.start);
                                const chordText = String(t.chord ?? "");

                                const isSel =
                                  moveTarget?.partIdx === partIdx &&
                                  moveTarget?.lineIdx === lineIdx &&
                                  moveTarget?.chordIdx === idx;

                                return (
                                  <button
                                    key={`${idx}-${leftCh}-${chordText}`}
                                    type="button"
                                    onClick={() => setMoveTarget({ partIdx, lineIdx, chordIdx: idx })}
                                    className={`absolute top-0 font-semibold underline decoration-dotted underline-offset-2 ${
                                      isSel ? "opacity-100" : "opacity-80"
                                    }`}
                                    style={{
                                      left: `calc(${leftCh}ch)`,
                                      color: "#2563EB", // azul (igual pedido no culto)
                                    }}
                                    title="Toque para selecionar"
                                  >
                                    {chordText}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Linha de letra (wrap igual ao culto) */}
                            <div
                              className="whitespace-pre font-mono overflow-hidden"
                              style={{ fontSize, lineHeight }}
                            >
                              {seg.lyricLine}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Painel de mover/trocar (não interfere no grid) */}
                    {moveTarget &&
                    moveTarget.partIdx === partIdx &&
                    moveTarget.lineIdx === lineIdx ? (
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        <button
                          className="rounded border px-2 py-1"
                          onClick={() => moveChordPos(partIdx, lineIdx, moveTarget.chordIdx, -1)}
                          title="Mover para esquerda"
                        >
                          ◀
                        </button>

                        <button
                          className="rounded border px-3 py-1"
                          onClick={() => {
                            const chordShown = String(shown[moveTarget.chordIdx]?.chord ?? "C");
                            openPicker(partIdx, lineIdx, moveTarget.chordIdx, chordShown);
                          }}
                          title="Trocar acorde"
                        >
                          Trocar acorde
                        </button>

                        <button
                          className="rounded border px-2 py-1"
                          onClick={() => moveChordPos(partIdx, lineIdx, moveTarget.chordIdx, +1)}
                          title="Mover para direita"
                        >
                          ▶
                        </button>

                        <button
                          className="ml-auto text-xs underline opacity-60"
                          onClick={() => setMoveTarget(null)}
                          title="Limpar seleção"
                        >
                          limpar
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
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