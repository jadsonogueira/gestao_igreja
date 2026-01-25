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
  id: string; // SongListItem.id
  order: number;
  song: SongMini;
};

type SongListDetail = {
  id: string;
  name: string;
  items: ListItem[];
};

function normKey(k?: string | null) {
  return String(k ?? "").trim().toUpperCase();
}

async function copyToClipboard(text: string) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "absolute";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function buildExportText(listName: string, items: ListItem[]) {
  const lines: string[] = [];
  lines.push(`Lista: ${listName}`);
  lines.push("");

  items.forEach((it, i) => {
    const s = it.song;
    const artist = s.artist ? ` - ${s.artist}` : "";
    lines.push(`${i + 1}. ${s.title}${artist} (Tom: ${normKey(s.originalKey)})`);
  });

  return lines.join("\n");
}

function buildExportMarkdown(listName: string, items: ListItem[]) {
  const lines: string[] = [];
  lines.push(`*${listName}*`);
  lines.push("");

  items.forEach((it, i) => {
    const s = it.song;
    const artist = s.artist ? ` — _${s.artist}_` : "";
    lines.push(`*${i + 1}.* *${s.title}*${artist}  _(Tom: ${normKey(s.originalKey)})_`);
  });

  return lines.join("\n");
}

export default function SongListDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<SongListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [movingId, setMovingId] = useState<string | null>(null);

  // busca dentro da lista
  const [query, setQuery] = useState("");

  // export modal
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"text" | "md">("text");

  // duplicate modal
  const [dupOpen, setDupOpen] = useState(false);
  const [dupName, setDupName] = useState("");

  // rename modal
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");

  // delete modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

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

  async function move(itemId: string, direction: "up" | "down") {
    if (movingId) return;
    setMovingId(itemId);

    const t = toast.loading("Reordenando...");
    try {
      const res = await fetch(`/api/song-lists/${params.id}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, direction }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "Erro");
      toast.success("Ordem atualizada!", { id: t });
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erro", { id: t });
    } finally {
      setMovingId(null);
    }
  }

  async function duplicateList() {
    const t = toast.loading("Duplicando lista...");
    try {
      const res = await fetch(`/api/song-lists/${params.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: dupName.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "Erro ao duplicar");
      const newId = json?.data?.id;

      toast.success("Lista duplicada!", { id: t });
      setDupOpen(false);
      setDupName("");
      if (newId) window.location.href = `/song-lists/${newId}`;
    } catch (e: any) {
      toast.error(e?.message || "Erro", { id: t });
    }
  }

  async function renameList() {
    const name = renameName.trim().replace(/\s+/g, " ");
    if (!name) return toast.error("Informe um nome");

    const t = toast.loading("Renomeando...");
    try {
      const res = await fetch(`/api/song-lists/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "Erro");
      toast.success("Renomeado!", { id: t });
      setRenameOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erro", { id: t });
    }
  }

  async function deleteList() {
    const currentName = data?.name ?? "";
    if (deleteConfirm.trim() !== currentName) {
      return toast.error("Digite exatamente o nome da lista para confirmar");
    }

    const t = toast.loading("Excluindo...");
    try {
      const res = await fetch(`/api/song-lists/${params.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "Erro");
      toast.success("Lista excluída!", { id: t });
      window.location.href = "/song-lists";
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

  const items = useMemo(() => data?.items ?? [], [data]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((it) => {
      const s = it.song;
      const hay = [s.title, s.artist ?? "", normKey(s.originalKey), ...(s.tags ?? [])]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [items, query]);

  const exportText = useMemo(() => {
    const name = data?.name ?? "Lista";
    return exportMode === "md"
      ? buildExportMarkdown(name, filteredItems)
      : buildExportText(name, filteredItems);
  }, [data?.name, filteredItems, exportMode]);

  async function onCopy() {
    try {
      await copyToClipboard(exportText);
      toast.success("Copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <a className="text-sm opacity-70 underline" href="/song-lists">
            ← Voltar
          </a>
          <h1 className="text-2xl font-semibold mt-1">{data?.name ?? "Lista"}</h1>
          <div className="text-xs opacity-60">ID: {params.id}</div>
        </div>

        <div className="flex flex-col gap-2 items-end">
          <a className="border rounded px-3 py-2 text-sm" href="/songs">
            Ver cifras
          </a>

          <button
            className="border rounded px-3 py-2 text-sm"
            onClick={() => {
              setRenameName(data?.name ?? "");
              setRenameOpen(true);
            }}
          >
            Renomear
          </button>

          <button
            className="border rounded px-3 py-2 text-sm"
            onClick={() => {
              setDupName("");
              setDupOpen(true);
            }}
          >
            Duplicar lista
          </button>

          <button
            className="border rounded px-3 py-2 text-sm"
            onClick={() => {
              setExportMode("text");
              setExportOpen(true);
            }}
          >
            Exportar (Texto)
          </button>

          <button
            className="border rounded px-3 py-2 text-sm"
            onClick={() => {
              setExportMode("md");
              setExportOpen(true);
            }}
          >
            Exportar (Markdown)
          </button>

          <button
            className="border rounded px-3 py-2 text-sm"
            onClick={() => {
              setDeleteConfirm("");
              setDeleteOpen(true);
            }}
          >
            Excluir
          </button>
        </div>
      </div>

      <div className="border rounded p-3">
        <div className="text-xs opacity-70 mb-2">Buscar na lista</div>
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Digite parte do título, artista ou tag..."
        />
        <div className="mt-2 text-xs opacity-60">
          Mostrando {filteredItems.length} de {items.length}
        </div>
      </div>

      {loading ? (
        <div className="border rounded p-4 text-sm opacity-70">Carregando...</div>
      ) : null}

      {!loading && !filteredItems.length ? (
        <div className="border rounded p-4 text-sm opacity-70">
          Nenhum resultado para a busca.
        </div>
      ) : null}

      <div className="space-y-2">
        {filteredItems.map((it, idx) => {
          const s = it.song;
          const isFirst = idx === 0;
          const isLast = idx === filteredItems.length - 1;
          const disabled = movingId === it.id;

          return (
            <div key={it.id} className="border rounded p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <a href={`/songs/${s.id}`} className="font-medium underline">
                    {s.title}
                  </a>
                  <div className="text-xs opacity-70">
                    {s.artist ? `${s.artist} • ` : ""}
                    Tom: <strong>{normKey(s.originalKey)}</strong>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-end">
                  <div className="flex gap-2">
                    <button
                      className="border rounded px-2 py-1 text-sm"
                      disabled={isFirst || disabled}
                      onClick={() => move(it.id, "up")}
                    >
                      ↑
                    </button>
                    <button
                      className="border rounded px-2 py-1 text-sm"
                      disabled={isLast || disabled}
                      onClick={() => move(it.id, "down")}
                    >
                      ↓
                    </button>
                  </div>

                  <button
                    className="border rounded px-3 py-2 text-sm"
                    onClick={() => removeSong(s.id)}
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* EXPORT MODAL */}
      {exportOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-xl border bg-white p-4 shadow-lg dark:bg-black">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  Exportar ({exportMode === "md" ? "Markdown" : "Texto"})
                </div>
                <div className="text-xs opacity-70">Exporta respeitando a busca.</div>
              </div>

              <button
                className="text-sm underline opacity-70"
                onClick={() => setExportOpen(false)}
              >
                Fechar
              </button>
            </div>

            <textarea
              className="mt-3 w-full rounded border p-3 font-mono text-sm"
              rows={10}
              value={exportText}
              readOnly
            />

            <div className="mt-3 flex justify-end gap-2">
              <button className="border rounded px-3 py-2 text-sm" onClick={onCopy}>
                Copiar
              </button>
              <button
                className="border rounded px-3 py-2 text-sm"
                onClick={() => setExportOpen(false)}
              >
                Ok
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* DUPLICAR MODAL */}
      {dupOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-xl border bg-white p-4 shadow-lg dark:bg-black">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Duplicar lista</div>
                <div className="text-xs opacity-70">Se deixar em branco, cria “(cópia)”.</div>
              </div>

              <button
                className="text-sm underline opacity-70"
                onClick={() => setDupOpen(false)}
              >
                Fechar
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <label className="text-xs opacity-70">Novo nome (opcional)</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={dupName}
                onChange={(e) => setDupName(e.target.value)}
                placeholder={`${data?.name ?? "Lista"} (cópia)`}
              />
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button className="border rounded px-3 py-2 text-sm" onClick={duplicateList}>
                Duplicar
              </button>
              <button
                className="border rounded px-3 py-2 text-sm"
                onClick={() => setDupOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* RENOMEAR MODAL */}
      {renameOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-xl border bg-white p-4 shadow-lg dark:bg-black">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Renomear lista</div>
                <div className="text-xs opacity-70">O nome é único.</div>
              </div>

              <button
                className="text-sm underline opacity-70"
                onClick={() => setRenameOpen(false)}
              >
                Fechar
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <label className="text-xs opacity-70">Novo nome</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
              />
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button className="border rounded px-3 py-2 text-sm" onClick={renameList}>
                Salvar
              </button>
              <button
                className="border rounded px-3 py-2 text-sm"
                onClick={() => setRenameOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* EXCLUIR MODAL */}
      {deleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-xl border bg-white p-4 shadow-lg dark:bg-black">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Excluir lista</div>
                <div className="text-xs opacity-70">
                  Para confirmar, digite exatamente: <strong>{data?.name ?? ""}</strong>
                </div>
              </div>

              <button
                className="text-sm underline opacity-70"
                onClick={() => setDeleteOpen(false)}
              >
                Fechar
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <label className="text-xs opacity-70">Confirmação</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button className="border rounded px-3 py-2 text-sm" onClick={deleteList}>
                Excluir
              </button>
              <button
                className="border rounded px-3 py-2 text-sm"
                onClick={() => setDeleteOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}