"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import AddToListButton from "./AddToListButton";
import {
  ListMusic,
  Import,
  Search,
  RefreshCw,
  Pencil,
  Church,
  Trash2,
  Music2,
} from "lucide-react";

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
  const [pageError, setPageError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setPageError(null);

    try {
      const res = await fetch("/api/songs?page=1&limit=50", { cache: "no-store" });

      // ✅ blindagem: pode vir HTML/erro
      const text = await res.text();
      let json: SongsResponse | null = null;

      try {
        json = JSON.parse(text) as SongsResponse;
      } catch {
        json = null;
      }

      if (!res.ok || !json?.success) {
        const msg = json?.error || `Erro ao carregar cifras (status ${res.status}).`;
        throw new Error(msg);
      }

      setItems(json.data?.items ?? []);
    } catch (e: any) {
      const msg = e?.message || "Erro ao carregar";
      setPageError(msg);
      toast.error(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(songId: string, title: string) {
    const ok = confirm(`Excluir a cifra "${title}"? Essa ação não pode ser desfeita.`);
    if (!ok) return;

    const t = toast.loading("Excluindo...");

    try {
      const res = await fetch(`/api/songs/${songId}`, { method: "DELETE" });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Erro ao excluir (status ${res.status})`);
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
      const tags = Array.isArray(s.tags) ? s.tags : [];
      const hay = `${s.title} ${s.artist ?? ""} ${s.originalKey} ${tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  return (
    <main className="mx-auto max-w-3xl px-3 py-4">
      {/* ✅ HEADER STICKY */}
      <div className="sticky top-0 z-20 -mx-3 mb-4 border-b bg-white/95 px-3 py-3 backdrop-blur dark:bg-black/80">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Music2 className="h-5 w-5 opacity-70" />
              <h1 className="text-xl font-semibold">Cifras</h1>
            </div>

            <div className="mt-1 text-sm opacity-70">
              Toque para editar/transpor — ou adicione direto numa lista.
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                href="/song-lists"
                title="Ir para listas"
              >
                <ListMusic className="h-4 w-4" />
                Listas
              </Link>

              <Link
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                href="/songs/import"
                title="Importar cifra"
              >
                <Import className="h-4 w-4" />
                Importar
              </Link>
            </div>
          </div>

          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
            title="Recarregar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Recarregar</span>
          </button>
        </div>

        {/* ✅ BUSCA COM ÍCONE */}
        <div className="mt-3">
          <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 dark:bg-black">
            <Search className="h-4 w-4 opacity-60" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, artista, tom ou tag..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>

          <div className="mt-2 flex items-center justify-between text-xs opacity-60">
            <div>
              {loading ? "Carregando..." : `Mostrando ${filtered.length} de ${items.length}`}
            </div>
            {pageError ? <div className="text-red-600">{pageError}</div> : null}
          </div>
        </div>
      </div>

      {/* STATES */}
      {loading ? (
        <div className="rounded-xl border p-4 text-sm opacity-70">Carregando...</div>
      ) : null}

      {!loading && !items.length && !pageError ? (
        <div className="rounded-xl border p-4 text-sm opacity-70">
          Nenhuma cifra ainda. Clique em <span className="font-medium">Importar</span> para começar.
        </div>
      ) : null}

      {!loading && items.length > 0 && filtered.length === 0 ? (
        <div className="rounded-xl border p-4 text-sm opacity-70">
          Nenhuma cifra encontrada para sua busca.
        </div>
      ) : null}

      {/* LIST */}
      <div className="space-y-3">
        {filtered.map((s) => (
          <div
            key={s.id}
            className="rounded-2xl border bg-white p-3 shadow-sm hover:bg-black/5 dark:bg-black dark:hover:bg-white/5"
          >
            <div className="flex items-start justify-between gap-3">
              {/* LEFT */}
              <div className="min-w-0">
                <Link
                  href={`/songs/${s.id}`}
                  className="block truncate text-base font-semibold hover:underline"
                  title="Abrir editor"
                >
                  {s.title}
                </Link>

                <div className="mt-0.5 text-xs opacity-70">
                  {s.artist ? `${s.artist} • ` : ""}
                  Tom: <strong>{s.originalKey}</strong>
                </div>

                {Array.isArray(s.tags) && s.tags.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.tags.slice(0, 6).map((t) => (
                      <span
                        key={t}
                        className="rounded-full border px-2 py-0.5 text-[11px] opacity-90"
                        title={t}
                      >
                        {t}
                      </span>
                    ))}
                    {s.tags.length > 6 ? (
                      <span className="text-[11px] opacity-60">+{s.tags.length - 6}</span>
                    ) : null}
                  </div>
                ) : null}

                {/* ✅ AÇÕES PRINCIPAIS (inline, bonitinhas) */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/songs/${s.id}`}
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Link>

                  <Link
                    href={`/songs/${s.id}/culto`}
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    title="Modo culto"
                  >
                    <Church className="h-4 w-4" />
                    Culto
                  </Link>
                </div>
              </div>

              {/* RIGHT */}
              <div className="flex flex-col items-end gap-2">
                {/* mantém seu componente */}
                <AddToListButton songId={s.id} compact />

                <button
                  type="button"
                  onClick={() => handleDelete(s.id, s.title)}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-white/5"
                  title="Excluir cifra"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* pequeno “respiro” no final */}
      <div className="h-6" />
    </main>
  );
}