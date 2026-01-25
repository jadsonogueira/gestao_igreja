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

export default function SongListDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [data, setData] = useState<SongListDetail | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/song-lists/${params.id}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json?.success) throw new Error(json?.error || "Erro");
    setData(json.data);
    setLoading(false);
  }

  async function removeSong(songId: string) {
    const t = toast.loading("Removendo...");
    try {
      const res = await fetch(`/api/song-lists/${params.id}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "Erro");
      toast.success("Removido!", { id: t });
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erro", { id: t });
    }
  }

  useEffect(() => {
    load().catch((e) => {
      toast.error(e?.message || "Erro ao carregar");
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const songs = useMemo(() => data?.items?.map((it) => it.song) ?? [], [data]);

  return (
    <main className="mx-auto max-w-2xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <a className="text-sm opacity-70 underline" href="/song-lists">
            ← Voltar
          </a>
          <h1 className="text-2xl font-semibold mt-1">
            {data?.name ?? "Lista"}
          </h1>
          <div className="text-xs opacity-60">ID: {params.id}</div>
        </div>

        <a className="border rounded px-3 py-2 text-sm" href="/songs">
          Ver cifras
        </a>
      </div>

      {loading ? (
        <div className="border rounded p-4 text-sm opacity-70">Carregando...</div>
      ) : null}

      {!loading && !songs.length ? (
        <div className="border rounded p-4 text-sm opacity-70">
          Essa lista ainda está vazia. Vá em <strong>/songs</strong> e adicione cifras nela.
        </div>
      ) : null}

      <div className="space-y-2">
        {songs.map((s) => (
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

              <button
                className="border rounded px-3 py-2 text-sm"
                onClick={() => removeSong(s.id)}
                title="Remover da lista"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}