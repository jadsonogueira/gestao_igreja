"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  MoreVertical,
  Music2,
  Pencil,
  Copy,
  Upload,
  Trash2,
  ChevronUp,
  ChevronDown,
  Church,
  ClipboardCopy,
  X,
} from "lucide-react";

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
    lines.push(`${i + 1}. ${s.title}${artist} (Tom: ${s.originalKey})`);
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
    lines.push(`*${i + 1}.* *${s.title}*${artist}  _(Tom: ${s.originalKey})_`);
  });

  return lines.join("\n");
}

function IconButton(props: {
  title: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "ghost" | "danger";
}) {
  const cls = `inline-flex items-center justify-center rounded-lg border px-2.5 py-2 text-sm
    ${
      props.variant === "danger"
        ? "border-red-500/30 hover:bg-red-500/10"
        : "border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
    }
    ${props.disabled ? "opacity-40 pointer-events-none" : ""}`;

  if (props.href) {
    return (
      <a className={cls} href={props.href} title={props.title} aria-label={props.title}>
        {props.children}
      </a>
    );
  }

  return (
    <button
      className={cls}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      aria-label={props.title}
    >
      {props.children}
    </button>
  );
}

export default function SongListDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<SongListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [movingId, setMovingId] = useState<string | null>(null);

  const [query, setQuery] = useState("");

  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"text" | "md">("text");

  const [dupOpen, setDupOpen] = useState(false);
  const [dupName, setDupName] = useState("");

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const [menuOpen, setMenuOpen] = useState(false);

  const listId = params.id;

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/song-lists/${listId}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json?.success) throw new Error(json?.error || "Erro");
    setData(json.data);
    setLoading(false);
  }

  async function removeSong(songId: string) {
    const t = toast.loading("Removendo...");
    try {
      const res = await fetch(`/api/song-lists/${listId}/remove`, {
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
      const res = await fetch(`/api/song-lists/${listId}/reorder`, {
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
      const res = await fetch(`/api/song-lists/${listId}/duplicate`, {
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
      const res = await fetch(`/api/song-lists/${listId}`, {
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
      const res = await fetch(`/api/song-lists/${listId}`, { method: "DELETE" });
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
      toast.error((e as any)?.message || "Erro ao carregar");
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  const items = useMemo(() => data?.items ?? [], [data]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((it) => {
      const s = it.song;
      const hay = [s.title, s.artist ?? "", s.originalKey, ...(s.tags ?? [])]
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

  const listName = data?.name ?? "Lista";
  const countText = loading
    ? "Carregando..."
    : `${filteredItems.length} de ${items.length}`;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-8">
      {/* TOP BAR (sticky) */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b bg-white/95 px-4 py-3 backdrop-blur dark:bg-black/85 dark:border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <a
              className="inline-flex items-center gap-2 text-sm opacity-80 hover:opacity-100"
              href="/song-lists"
            >
              <ArrowLeft size={18} />
              Voltar
            </a>

            <div className="mt-1 flex items-baseline gap-2 min-w-0">
              <h1 className="text-xl font-semibold truncate">{listName}</h1>
              <span className="text-xs opacity-60 whitespace-nowrap">({countText})</span>
            </div>
            <div className="text-[11px] opacity-50 truncate">ID: {listId}</div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <IconButton title="Ver cifras" href="/songs">
              <Music2 size={18} />
            </IconButton>

            <IconButton
              title={menuOpen ? "Fechar menu" : "Ações"}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MoreVertical size={18} />
            </IconButton>
          </div>
        </div>

        {/* MENU AÇÕES */}
        {menuOpen ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              onClick={() => {
                setRenameName(data?.name ?? "");
                setRenameOpen(true);
                setMenuOpen(false);
              }}
            >
              <span className="inline-flex items-center gap-2">
                <Pencil size={16} /> Renomear
              </span>
            </button>

            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              onClick={() => {
                setDupName("");
                setDupOpen(true);
                setMenuOpen(false);
              }}
            >
              <span className="inline-flex items-center gap-2">
                <Copy size={16} /> Duplicar
              </span>
            </button>

            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              onClick={() => {
                setExportMode("text");
                setExportOpen(true);
                setMenuOpen(false);
              }}
            >
              <span className="inline-flex items-center gap-2">
                <Upload size={16} /> Exportar
              </span>
            </button>

            <button
              className="rounded-lg border border-red-500/30 px-3 py-2 text-sm hover:bg-red-500/10"
              onClick={() => {
                setDeleteConfirm("");
                setDeleteOpen(true);
                setMenuOpen(false);
              }}
            >
              <span className="inline-flex items-center gap-2">
                <Trash2 size={16} /> Excluir
              </span>
            </button>
          </div>
        ) : null}

        {/* SEARCH */}
        <div className="mt-3">
          <input
            className="w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-black"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar: título, artista, tom, tag..."
          />
        </div>
      </div>

      {/* STATES */}
      {loading ? (
        <div className="rounded-xl border p-4 text-sm opacity-70">Carregando...</div>
      ) : null}

      {!loading && !filteredItems.length ? (
        <div className="rounded-xl border p-4 text-sm opacity-70">
          Nenhum resultado para a busca.
        </div>
      ) : null}

      {/* LIST */}
      <div className="space-y-3">
        {filteredItems.map((it, idx) => {
          const s = it.song;
          const isFirst = idx === 0;
          const isLast = idx === filteredItems.length - 1;
          const disabled = movingId === it.id;

          return (
            <div
              key={it.id}
              className="rounded-2xl border bg-white p-3 shadow-sm dark:bg-black dark:border-white/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{s.title}</div>
                  <div className="mt-0.5 text-xs opacity-70 truncate">
                    {s.artist ? `${s.artist} • ` : ""}
                    Tom: <strong>{s.originalKey}</strong>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <IconButton
                      title="Editar cifra"
                      href={`/songs/${s.id}?listId=${encodeURIComponent(listId)}`}
                    >
                      <Pencil size={16} />
                    </IconButton>

                    <IconButton
                      title="Modo Culto"
                      href={`/songs/${s.id}/culto?listId=${encodeURIComponent(listId)}`}
                    >
                      <Church size={16} />
                    </IconButton>

                    <IconButton
                      title="Remover da lista"
                      onClick={() => removeSong(s.id)}
                      variant="danger"
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-end shrink-0">
                  <IconButton
                    title="Mover para cima"
                    disabled={isFirst || disabled}
                    onClick={() => move(it.id, "up")}
                  >
                    <ChevronUp size={18} />
                  </IconButton>

                  <IconButton
                    title="Mover para baixo"
                    disabled={isLast || disabled}
                    onClick={() => move(it.id, "down")}
                  >
                    <ChevronDown size={18} />
                  </IconButton>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* EXPORT MODAL */}
      {exportOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-2xl border bg-white p-4 shadow-lg dark:bg-black dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  Exportar ({exportMode === "md" ? "Markdown" : "Texto"})
                </div>
                <div className="text-xs opacity-70">
                  Exporta respeitando a busca ({filteredItems.length} itens).
                </div>
              </div>

              <IconButton title="Fechar" onClick={() => setExportOpen(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                className={`rounded-lg border px-3 py-2 text-sm ${
                  exportMode === "text" ? "bg-black/5 dark:bg-white/5" : ""
                }`}
                onClick={() => setExportMode("text")}
              >
                Texto
              </button>
              <button
                className={`rounded-lg border px-3 py-2 text-sm ${
                  exportMode === "md" ? "bg-black/5 dark:bg-white/5" : ""
                }`}
                onClick={() => setExportMode("md")}
              >
                Markdown
              </button>
            </div>

            <textarea
              className="mt-3 w-full rounded-xl border p-3 font-mono text-sm bg-white dark:bg-black"
              rows={10}
              value={exportText}
              readOnly
            />

            <div className="mt-3 flex justify-end gap-2">
              <button
                className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 inline-flex items-center gap-2"
                onClick={onCopy}
              >
                <ClipboardCopy size={16} /> Copiar
              </button>
              <button
                className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
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
          <div className="w-full max-w-xl rounded-2xl border bg-white p-4 shadow-lg dark:bg-black dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Duplicar lista</div>
                <div className="text-xs opacity-70">Se deixar em branco, cria “(cópia)”.</div>
              </div>

              <IconButton title="Fechar" onClick={() => setDupOpen(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div className="mt-3 space-y-2">
              <label className="text-xs opacity-70">Novo nome (opcional)</label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-black"
                value={dupName}
                onChange={(e) => setDupName(e.target.value)}
                placeholder={`${data?.name ?? "Lista"} (cópia)`}
              />
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                onClick={duplicateList}
              >
                Duplicar
              </button>
              <button
                className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
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
          <div className="w-full max-w-xl rounded-2xl border bg-white p-4 shadow-lg dark:bg-black dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Renomear lista</div>
                <div className="text-xs opacity-70">O nome é único.</div>
              </div>

              <IconButton title="Fechar" onClick={() => setRenameOpen(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div className="mt-3 space-y-2">
              <label className="text-xs opacity-70">Novo nome</label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-black"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
              />
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                onClick={renameList}
              >
                Salvar
              </button>
              <button
                className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
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
          <div className="w-full max-w-xl rounded-2xl border bg-white p-4 shadow-lg dark:bg-black dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Excluir lista</div>
                <div className="text-xs opacity-70">
                  Para confirmar, digite exatamente: <strong>{data?.name ?? ""}</strong>
                </div>
              </div>

              <IconButton title="Fechar" onClick={() => setDeleteOpen(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div className="mt-3 space-y-2">
              <label className="text-xs opacity-70">Confirmação</label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-black"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                className="rounded-lg border border-red-500/30 px-3 py-2 text-sm hover:bg-red-500/10 inline-flex items-center gap-2"
                onClick={deleteList}
              >
                <Trash2 size={16} /> Excluir
              </button>
              <button
                className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
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