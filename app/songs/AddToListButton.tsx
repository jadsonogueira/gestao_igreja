"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

type SongList = {
  id: string;
  name: string;
  inList?: boolean;
  itemId?: string | null;
};

export default function AddToListButton({
  songId,
  compact = false,
}: {
  songId: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<SongList[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadLists() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/song-lists?songId=${encodeURIComponent(songId)}`,
        { cache: "no-store" }
      );
      const json = await res.json();

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Erro ao carregar listas");
      }

      setLists(json.data ?? []);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar listas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function addToList(listId: string) {
    const t = toast.loading("Adicionando na lista...");
    try {
      const res = await fetch(`/api/song-lists/${listId}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId }),
      });
      const json = await res.json();

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Erro ao adicionar na lista");
      }

      toast.success("Adicionado!", { id: t });
      await loadLists();
    } catch (e: any) {
      toast.error(e?.message || "Erro", { id: t });
    }
  }

  async function removeFromList(listId: string) {
    const t = toast.loading("Removendo da lista...");
    try {
      const res = await fetch(`/api/song-lists/${listId}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId }),
      });
      const json = await res.json();

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Erro ao remover da lista");
      }

      toast.success("Removido!", { id: t });
      await loadLists();
    } catch (e: any) {
      toast.error(e?.message || "Erro", { id: t });
    }
  }

  async function toggleList(list: SongList) {
    if (list.inList) return removeFromList(list.id);
    return addToList(list.id);
  }

  const buttonClass = useMemo(() => {
    return compact
      ? "border rounded px-2 py-1 text-xs"
      : "border rounded px-3 py-2 text-sm";
  }, [compact]);

  return (
    <div className="relative inline-block">
      <button
        className={buttonClass}
        onClick={() => setOpen((v) => !v)}
        title="Adicionar/remover esta cifra em listas"
      >
        {loading && open ? "..." : "+ Lista"}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border bg-white p-2 shadow-md dark:bg-black">
          <div className="mb-2 text-xs font-semibold opacity-70">
            Listas (✅ = já está)
          </div>

          {loading ? (
            <div className="rounded border p-2 text-sm opacity-70">
              Carregando...
            </div>
          ) : null}

          {!loading && !lists.length ? (
            <div className="rounded border p-2 text-sm opacity-70">
              Você ainda não tem listas. Crie em{" "}
              <a className="underline" href="/song-lists">
                /song-lists
              </a>
              .
            </div>
          ) : null}

          {!loading && lists.length ? (
            <div className="space-y-1">
              {lists.map((l) => (
                <button
                  key={l.id}
                  className="w-full rounded-md border px-2 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                  onClick={() => toggleList(l)}
                  title={l.inList ? "Clique para remover" : "Clique para adicionar"}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{l.name}</span>
                    <span className="text-xs opacity-70">
                      {l.inList ? "✅ remover" : "adicionar"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <a className="text-xs underline opacity-70" href="/song-lists">
              Gerenciar listas
            </a>
            <button
              className="text-xs underline opacity-70"
              onClick={() => setOpen(false)}
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}