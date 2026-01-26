"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

function normalizeTags(input: string) {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/\s+/g, " "));
}

type ImportResponse =
  | {
      success: true;
      data: {
        id: string;
        detectedKey: string | null;
        originalKeyUsed: string;
        mode?: "inline" | "above";
      };
    }
  | { success: false; error?: string };

export default function ImportSongPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [rawText, setRawText] = useState("");

  const [saving, setSaving] = useState(false);

  const tags = useMemo(() => normalizeTags(tagsText), [tagsText]);

  async function handleImport() {
    const t = title.trim();
    const txt = rawText.trim();

    if (!t) {
      toast.error("Informe o título.");
      return;
    }

    if (!txt) {
      toast.error("Cole o texto da cifra.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/songs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          artist: artist.trim() || null,
          rawText: txt,
          tags,
        }),
      });

      const json = (await res.json().catch(() => null)) as ImportResponse | null;

      if (!res.ok || !json) {
        throw new Error((json as any)?.error || "Erro ao importar cifra.");
      }

      if (json.success !== true) {
        throw new Error(json.error || "Erro ao importar cifra.");
      }

      const id = json.data?.id;
      if (!id) throw new Error("Resposta inválida do servidor (faltou data.id).");

      const used = json.data.originalKeyUsed;
      const detected = json.data.detectedKey;
      const mode = json.data.mode ?? null;

      const modeLabel =
        mode === "inline"
          ? "inline ([C]letra)"
          : mode === "above"
          ? "acordes acima"
          : "auto";

      if (!detected) {
        toast.success(`Importado! Tom: ${used}. Parser: ${modeLabel}`);
      } else {
        toast.success(`Importado! Tom detectado: ${used}. Parser: ${modeLabel}`);
      }

      router.push(`/songs/${id}`);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao importar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Importar cifra</h1>
          <div className="text-sm opacity-70">
            Aceita 2 formatos:
            <br />• <span className="font-mono">A9 D/A</span> em cima da letra (clássico)
            <br />• <span className="font-mono">[F]Ele é exaltado...</span> (inline)
          </div>
        </div>

        <Link href="/songs" className="border rounded px-3 py-2 text-sm hover:bg-gray-50 transition">
          Voltar
        </Link>
      </div>

      <div className="border rounded p-4 space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Título *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Aclame ao Senhor"
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Artista</label>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Ex: Diante do Trono"
            className="w-full border rounded px-3 py-2 text-sm"
          />
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

        <div className="space-y-1">
          <label className="text-sm font-medium">Texto da cifra *</label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Cole aqui (Cifra Club ou formato inline [C]letra)..."
            className="w-full border rounded px-3 py-2 text-sm min-h-[320px] font-mono"
          />
          <div className="text-xs opacity-70">
            Dica: pode colar tudo (incluindo “Tom: …”). Se não detectar, o tom será definido como C.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link href="/songs" className="border rounded px-3 py-2 text-sm hover:bg-gray-50 transition">
            Cancelar
          </Link>

          <button
            onClick={handleImport}
            disabled={saving}
            className="rounded px-3 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-60"
          >
            {saving ? "Importando..." : "Importar"}
          </button>
        </div>
      </div>
    </main>
  );
}