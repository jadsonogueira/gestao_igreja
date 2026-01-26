"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

const KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

function normalizeTags(input: string) {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/\s+/g, " "));
}

export default function NewSongPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [originalKey, setOriginalKey] = useState("C");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);

  const tags = useMemo(() => normalizeTags(tagsText), [tagsText]);

  async function handleCreate() {
    const t = title.trim();
    if (!t) {
      toast.error("Informe o título da cifra.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          artist: artist.trim() || null,
          originalKey,
          tags,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error || "Erro ao criar cifra.");
      }

      // esperamos { id: "..." }
      if (!json?.id) {
        throw new Error("Resposta inválida do servidor (faltou id).");
      }

      toast.success("Cifra criada!");
      router.push(`/songs/${json.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao criar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Nova cifra</h1>
          <div className="text-sm opacity-70">
            Crie uma cifra vazia e depois edite, cole ou organize em listas.
          </div>
        </div>

        <Link
          href="/songs"
          className="border rounded px-3 py-2 text-sm hover:bg-gray-50 transition"
        >
          Voltar
        </Link>
      </div>

      <div className="border rounded p-4 space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Título *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Teu Amor Não Falha"
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Artista</label>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Ex: Jesus Culture"
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Tom original *</label>
            <select
              value={originalKey}
              onChange={(e) => setOriginalKey(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              {KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Tags (separadas por vírgula)</label>
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="Ex: louvor, ceia, batismo"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link
            href="/songs"
            className="border rounded px-3 py-2 text-sm hover:bg-gray-50 transition"
          >
            Cancelar
          </Link>

          <button
            onClick={handleCreate}
            disabled={saving}
            className="rounded px-3 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-60"
          >
            {saving ? "Criando..." : "Criar cifra"}
          </button>
        </div>
      </div>
    </main>
  );
}