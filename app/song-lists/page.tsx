"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

type SongList = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export default function SongListsPage() {
  const [lists, setLists] = useState<SongList[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/song-lists", { cache: "no-store" });
    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || "Erro ao listar");
    setLists(json.data ?? []);
  }

  async function createList() {
    const n = name.trim();
    if (!n) return;

    setLoading(true);
    const t = toast.loading("Criando lista...");

    try {
      const res = await fetch("/api/song-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      const json = await res.json();

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Erro ao criar lista");
      }

      setName("");
      toast.success("Lista criada!", { id: t });
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erro", { id: t });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((e) => toast.error(e?.message || "Erro ao carregar"));
  }, []);

  return (
    <main className="mx-auto max-w-xl p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Listas de cifras</h1>

      <div className="flex gap-2">
        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="Ex: Louvor Domingo"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="border rounded px-3 py-2"
          disabled={loading}
          onClick={createList}
        >
          Criar
        </button>
      </div>

      <div className="space-y-2">
        {lists.map((l) => (
          <a
            key={l.id}
            href={`/song-lists/${l.id}`}
            className="block border rounded p-3 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <div className="font-medium">{l.name}</div>
            <div className="text-xs opacity-60">ID: {l.id}</div>
          </a>
        ))}

        {!lists.length ? (
          <div className="text-sm opacity-70 border rounded p-3">
            Nenhuma lista criada ainda.
          </div>
        ) : null}
      </div>
    </main>
  );
}