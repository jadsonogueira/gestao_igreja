"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  ArrowLeft,
  ListMusic,
  Plus,
  RefreshCw,
  Search,
  ChevronRight,
} from "lucide-react";

type SongList = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

function cn(...cls: Array<string | false | null | undefined>) {
  return cls.filter(Boolean).join(" ");
}

export default function SongListsPage() {
  const [lists, setLists] = useState<SongList[]>([]);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");

  const [loading, setLoading] = useState(false); // usado no create
  const [pageLoading, setPageLoading] = useState(false); // usado no load
  const [pageError, setPageError] = useState<string | null>(null);

  async function load() {
    setPageLoading(true);
    setPageError(null);

    try {
      const res = await fetch("/api/song-lists", { cache: "no-store" });

      // blindagem contra HTML / erro inesperado
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Erro ao listar (status ${res.status})`);
      }

      setLists(json.data ?? []);
    } catch (e: any) {
      const msg = e?.message || "Erro ao carregar";
      setPageError(msg);
      toast.error(msg);
      setLists([]);
    } finally {
      setPageLoading(false);
    }
  }

  async function createList() {
    const n = name.trim().replace(/\s+/g, " ");
    if (!n) return;

    setLoading(true);
    const t = toast.loading("Criando lista...");

    try {
      const res = await fetch("/api/song-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Erro ao criar (status ${res.status})`);
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
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lists;
    return lists.filter((l) => (l.name ?? "").toLowerCase().includes(q));
  }, [lists, query]);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-10">
      {/* HEADER STICKY */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b bg-white/95 px-4 py-3 backdrop-blur dark:bg-black/90">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href="/songs"
                className="inline-flex items-center gap-2 text-sm opacity-80 hover:opacity-100"
                title="Voltar para Cifras"
              >
                <ArrowLeft size={16} />
                <span className="underline">Voltar</span>
              </Link>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white dark:bg-neutral-950">
                <ListMusic size={18} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold leading-tight">
                  Listas
                </h1>
                <div className="text-xs opacity-70">
                  Organize repertórios por culto e navegue entre músicas.
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={load}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
              "hover:bg-black/5 dark:hover:bg-white/5"
            )}
            title="Recarregar"
            disabled={pageLoading}
          >
            <RefreshCw size={16} className={pageLoading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Recarregar</span>
          </button>
        </div>
      </div>

      {/* CRIAR LISTA */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm dark:bg-neutral-950">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Criar nova lista</div>
            <div className="text-xs opacity-70">
              Ex: <span className="font-mono">Louvor Domingo</span>,{" "}
              <span className="font-mono">Santa Ceia</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="w-full flex-1 rounded-xl border px-3 py-2 text-sm"
            placeholder="Nome da lista"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createList();
            }}
          />

          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium",
              "hover:bg-black/5 dark:hover:bg-white/5",
              loading ? "opacity-60" : ""
            )}
            disabled={loading}
            onClick={createList}
            title="Criar lista"
          >
            <Plus size={16} />
            Criar
          </button>
        </div>

        {/* BUSCA */}
        <div className="mt-4 flex items-center gap-2 rounded-xl border px-3 py-2">
          <Search size={16} className="opacity-60" />
          <input
            className="w-full bg-transparent text-sm outline-none"
            placeholder="Buscar lista..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="mt-2 text-xs opacity-60">
          {pageLoading
            ? "Carregando..."
            : `Mostrando ${filtered.length} de ${lists.length}`}
        </div>

        {pageError ? (
          <div className="mt-2 text-xs text-red-600">{pageError}</div>
        ) : null}
      </div>

      {/* LISTA DE CARDS */}
      <div className="mt-4 space-y-2">
        {pageLoading ? (
          <div className="rounded-2xl border p-4 text-sm opacity-70">
            Carregando...
          </div>
        ) : null}

        {!pageLoading && filtered.map((l) => (
          <Link
            key={l.id}
            href={`/song-lists/${l.id}`}
            className={cn(
              "group block rounded-2xl border bg-white p-4 shadow-sm",
              "hover:bg-black/5 dark:bg-neutral-950 dark:hover:bg-white/5"
            )}
            title="Abrir lista"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold truncate">{l.name}</div>
                <div className="mt-1 text-xs opacity-60 truncate">
                  ID: <span className="font-mono">{l.id}</span>
                </div>
              </div>

              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border opacity-80 group-hover:opacity-100">
                <ChevronRight size={18} />
              </div>
            </div>
          </Link>
        ))}

        {!pageLoading && !filtered.length ? (
          <div className="rounded-2xl border p-4 text-sm opacity-70">
            {lists.length
              ? "Nenhuma lista encontrada para essa busca."
              : "Nenhuma lista criada ainda. Crie a primeira acima."}
          </div>
        ) : null}
      </div>
    </main>
  );
}