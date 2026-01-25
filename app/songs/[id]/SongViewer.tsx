"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

const KEY_OPTIONS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"] as const;

function normKey(k?: string | null) {
  return String(k ?? "").trim().toUpperCase();
}

function keyToSemitone(key: string) {
  const k = normKey(key);
  const map: Record<string, number> = {
    C: 0,
    "C#": 1, DB: 1,
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

function transposePartsBase(parts: SongPart[], semitones: number, accidentalPref: AccidentalPref) {
  if (semitones === 0) return deepCloneParts(parts);

  return parts.map((p) => ({
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

type ListOption = { id: string; name: string };

export default function SongViewer({ song }: { song: SongDetail }) {
  const router = useRouter();

  const accidentalPref: AccidentalPref = "sharp";

  const [savedOriginalKey, setSavedOriginalKey] = useState<string>(normKey(song.originalKey));
  const [partsBase, setPartsBase] = useState<SongPart[]>(
    () => deepCloneParts(song.content?.parts ?? [])
  );

  const [transpose, setTranspose] = useState(0);

  const [snapshot, setSnapshot] = useState(() =>
    JSON.stringify({
      parts: song.content?.parts ?? [],
      originalKey: normKey(song.originalKey),
    })
  );

  const dirty = useMemo(() => {
    if (transpose !== 0) return true;
    const now = JSON.stringify({ parts: partsBase, originalKey: savedOriginalKey });
    return now !== snapshot;
  }, [partsBase, savedOriginalKey, snapshot, transpose]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<{
    partIdx: number;
    lineIdx: number;
    chordIdx: number;
    displayChord: string;
  } | null>(null);

  const parts = useMemo(() => partsBase ?? [], [partsBase]);

  const currentKey = useMemo(() => {
    return transposeKey(savedOriginalKey, transpose);
  }, [savedOriginalKey, transpose]);

  // ====== ADD TO LIST MODAL ======
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listsLoading, setListsLoading] = useState(false);
  const [lists, setLists] = useState<ListOption[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");

  async function loadLists() {
    setListsLoading(true);
    try {
      const res = await fetch("/api/song-lists", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "Erro ao listar");
      setLists((json.data ?? []).map((x: any) => ({ id: x.id, name: x.name })));
    } finally {
      setListsLoading(false);
    }
  }

  function openAddToList() {
    setListModalOpen(true);
    setSelectedListId("");
    loadLists().catch((e: any) => toast.error(e?.message || "Erro ao carregar listas"));
  }

  async function addToList() {
    if (!selectedListId) return toast.error("Escolha uma lista");

    const t = toast.loading("Adicionando na lista...");
    try {
      const res = await fetch(`/api/song-lists/${selectedListId}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: song.id }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "Erro ao adicionar");

      if (json?.data?.alreadyExists) {
        toast.success("Já estava na lista.", { id: t });
      } else {
        toast.success("Adicionado!", { id: t });
      }

      setListModalOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro", { id: t });
    }
  }

  // ====== PICKER ======
  function openPicker(partIdx: number, lineIdx: number, chordIdx: number, chordShown: string) {
    setSelected({ partIdx, lineIdx, chordIdx, displayChord: chordShown });
    setPickerOpen(true);
  }

  function applyPickedChord(newChordShown: string) {
    if (!selected) return;

    const newChordBase =
      transpose !== 0
        ? transposeChord(newChordShown, -transpose, accidentalPref)
        : newChordShown;

    setPartsBase((prev) => {
      const next = deepCloneParts(prev);
      const target = next[selected.partIdx]?.lines?.[selected.lineIdx]?.chords?.[selected.chordIdx];
      if (target) target.chord = newChordBase;
      return next;
    });

    setPickerOpen(false);
    setSelected(null);
  }

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/songs");
  }

  async function handleSave() {
    const t = toast.loading("Salvando...");

    try {
      const partsToSave =
        transpose !== 0
          ? transposePartsBase(partsBase, transpose, accidentalPref)
          : deepCloneParts(partsBase);

      const newOriginalKey = currentKey;

      const res = await fetch(`/api/songs/${song.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: partsToSave },
          originalKey: newOriginalKey,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "Erro ao salvar");

      const serverKey = normKey(json?.data?.originalKey ?? newOriginalKey);

      setPartsBase(partsToSave);
      setSavedOriginalKey(serverKey);
      setTranspose(0);

      setSnapshot(
        JSON.stringify({
          parts: partsToSave,
          originalKey: serverKey,
        })
      );

      toast.success("Tudo salvo.", { id: t });
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar", { id: t });
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-4 rounded-xl border p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button className="text-sm underline opacity-70" onClick={handleBack}>
              ← Voltar
            </button>

            <h1 className="text-2xl font-semibold mt-2">{song.title}</h1>

            <div className="mt-2 text-sm opacity-90">
              {song.artist ? `${song.artist} • ` : ""}
              Tom: <strong>{currentKey}</strong>
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

            <div className="mt-2 text-sm opacity-70">
              {dirty ? "Alterações pendentes." : "Tudo salvo."}
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
              title="Voltar ao tom salvo (visual)"
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
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={openAddToList}
              title="Adicionar em uma lista"
            >
              + Lista
            </button>

            <button
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={handleSave}
              disabled={!dirty}
              title={dirty ? "Salvar alterações" : "Nada para salvar"}
            >
              Salvar
            </button>
          </div>
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

                const chordOverlay = buildChordOverlay(line.lyric ?? "", transposedTokens);

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
                            onClick={() => openPicker(partIdx, lineIdx, chordIdx, c.chord)}
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

      {/* MODAL ADICIONAR NA LISTA */}
      {listModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-xl border bg-white p-4 shadow-lg dark:bg-black">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Adicionar em lista</div>
                <div className="text-xs opacity-70">
                  Escolha a lista onde quer adicionar esta cifra.
                </div>
              </div>

              <button
                className="text-sm underline opacity-70"
                onClick={() => setListModalOpen(false)}
              >
                Fechar
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <label className="text-xs opacity-70">Lista</label>

              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
                disabled={listsLoading}
              >
                <option value="">
                  {listsLoading ? "Carregando..." : "Selecione..."}
                </option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>

              <div className="text-xs opacity-60">
                {listsLoading ? "Buscando listas..." : `${lists.length} listas encontradas`}
              </div>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                className="border rounded px-3 py-2 text-sm"
                onClick={addToList}
                disabled={!selectedListId || listsLoading}
              >
                Adicionar
              </button>
              <button
                className="border rounded px-3 py-2 text-sm"
                onClick={() => setListModalOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

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