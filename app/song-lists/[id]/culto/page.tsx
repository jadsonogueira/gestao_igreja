"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

type SongMini = {
  id: string;
  title: string;
  artist: string | null;
  originalKey: string;
  tags: string[];
  updatedAt: string;
};

type ListItem = {
  id: string;
  order: number;
  song: SongMini;
};

type SongListDetail = {
  id: string;
  name: string;
  items: ListItem[];
};

export default function SongListCultoPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<SongListDetail | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/song-lists/${params.id}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json?.success) throw new Error(json?.error || "Erro ao buscar lista");
    setData(json.data);
    setLoading(false);
  }

  useEffect(() => {
    load().catch((e: any) => {
      toast.error(e?.message || "Erro ao carregar");
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const items = useMemo(() => data?.items ?? [], [data]);

  return (
    <main className="mx-auto max-w-2xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <a className="text-sm opacity-70 underline" href={`/song-lists/${params.id}`}>
            ← Voltar para a lista
          </a>
          <h1 className="text-2xl font-semibold mt-1">Modo Culto</h1>
          <div className="text-sm opacity-80">{data?.name ?? "Lista"}</div>
        </div>

        <a className="border rounded px-3 py-2 text-sm" href="/songs">
          Ver cifras
        </a>
      </div>

      {loading ? (
        <div className="border rounded p-4 text-sm opacity-70">Carregando...</div>
      ) : null}

      {!loading && !items.length ? (
        <div className="border rounded p-4 text-sm opacity-70">Lista vazia.</div>
      ) : null}

      <div className="space-y-2">
        {items.map((it, idx) => {
          const s = it.song;
          return (
            <a
              key={it.id}
              href={`/songs/${s.id}/culto`}
              className="block border rounded p-4 hover:bg-black/5 dark:hover:bg-white/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm opacity-70">#{idx + 1}</div>
                  <div className="text-xl font-semibold">{s.title}</div>
                  <div className="text-sm opacity-70">
                    {s.artist ? `${s.artist} • ` : ""}
                    Tom: <strong>{s.originalKey}</strong>
                  </div>
                </div>
                <div className="text-sm opacity-60">Abrir →</div>
              </div>
            </a>
          );
        })}
      </div>
    </main>
  );
}