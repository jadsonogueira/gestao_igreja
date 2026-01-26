"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import AddToListButton from "./AddToListButton";

type SongItem = {
  id: string;
  title: string;
  artist: string | null;
  originalKey: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type SongsResponse = {
  success: boolean;
  error?: string;
  data?: {
    items: SongItem[];
    total: number;
    page: number;
    limit: number;
  };
};

export default function SongsPage() {
  const [items, setItems] = useState<SongItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/songs?page=1&limit=50", { cache: "no-store" });
      const json: SongsResponse = await res.json();

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Erro ao carregar cifras");
      }

      setItems(json.data?.items ?? []);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(songId: string, title: string) {
    const ok = confirm(`Excluir a cifra "${title}"? Essa ação não pode ser desfeita.`);
    if (!ok) return;

    const t = toast.loading("Excluindo...");

    try {
      const res = await fetch(`/api/songs/${songId}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Erro ao excluir cifra");
      }

      setItems((prev) => prev.filter((s) => s.id !== songId));
      toast.success("Cifra excluída.", { id: t });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir", { id: t });
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((s) => {
      const hay = `${s.title} ${s.artist ?? ""} ${s.originalKey} ${(s.tags ?? []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  return (
    <main className="mx-auto max-w-3xl p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cifras</h1>
          <div className="text-sm opacity-70">
            Clique na cifra para editar/transpor, ou adicione direto numa lista.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="border rounded px-3 py-2 text-sm hover:bg-gray-50 transition"
            href="/song-lists"
          >
            Listas
          </Link>

          <Link
            className="border rounded px-3 py-2 text-sm hover:bg-gray-50 transition"
            href="/songs/import"
          >
            Importar
          </Link>

          {/* ✅ removido: Nova cifra */}
        </div>
      </div>

      {/* ✅ Buscar */}
      <div className="border rounded p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título, artista, tom ou tag..."
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <div className="mt-1 text-xs opacity-60">
          Mostrando {filtered.length} de {items.length}
        </div>
      </div>

      {/* States */}
      {loading ? (
        <div className="border rounded p-4 text-sm opacity-70">Carregando...</div>
      ) : null}

      {!loading && !items.length ? (
        <div className="border rounded p-4 text-sm opacity-70">
          Nenhuma cifra ainda. Clique em <span className="font-medium">Importar</span> para começar.
        </div>
      ) : null}

      {!loading && items.length > 0 && filtered.length === 0 ? (
        <div className="border rounded p-4 text-sm opacity-70">
          Nenhuma cifra encontrada para sua busca.
        </div>
      ) : null}

      {/* List */}
      <div className="space-y-2">
        {filtered.map((s) => (
          <div key={s.id} className="border rounded p-3 hover:bg-gray-50 transition">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/songs/${s.id}`} className="font-medium underline">
                  {s.title}
                </Link>

                <div className="text-xs opacity-70">
                  {s.artist ? `${s.artist} • ` : ""}Tom: {s.originalKey}
                </div>

                {s.tags?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.tags.map((t) => (
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

              {/* ✅ Coluna direita: +Lista e Excluir (Excluir abaixo) */}
              <div className="flex flex-col items-end gap-2">
                <AddToListButton songId={s.id} compact />

                <button
                  type="button"
                  onClick={() => handleDelete(s.id, s.title)}
                  className="border rounded px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                  title="Excluir cifra"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}