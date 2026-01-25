"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cifras</h1>
          <div className="text-sm opacity-70">
            Clique na cifra para editar/transpor, ou adicione direto numa lista.
          </div>
        </div>

        <a className="border rounded px-3 py-2 text-sm" href="/song-lists">
          Listas
        </a>
      </div>

      {loading ? (
        <div className="border rounded p-4 text-sm opacity-70">Carregando...</div>
      ) : null}

      {!loading && !items.length ? (
        <div className="border rounded p-4 text-sm opacity-70">
          Nenhuma cifra ainda.
        </div>
      ) : null}

      <div className="space-y-2">
        {items.map((s) => (
          <div key={s.id} className="border rounded p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <a href={`/songs/${s.id}`} className="font-medium underline">
                  {s.title}
                </a>
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

              {/* ✅ adicionar à lista direto na listagem */}
              <AddToListButton songId={s.id} compact />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}