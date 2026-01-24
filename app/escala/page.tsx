"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw, CalendarDays, DownloadCloud } from "lucide-react";
import Button from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EscalaTipo } from "@/lib/types";

type EscalaItem = {
  id: string;
  tipo: EscalaTipo;
  dataEvento: string; // ISO
  nomeResponsavel: string;
  mensagem?: string | null;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  range?: { days: number; start: string; timeMin: string; timeMax: string };
  items?: EscalaItem[];
};

type ImportResponse = {
  ok: boolean;
  error?: string;
  details?: string;
  reason?: string;
  range?: { days: number; timeMin: string; timeMax: string; timeZoneApp?: string };
  totals?: {
    googleEvents: number;
    parsed: number;
    created: number;
    updated: number;
    ignored: number;
    matchedMembers?: number;
  };
};

const tipoLabel: Record<string, string> = {
  DIRIGENTE: "Dirigente",
  LOUVOR: "Louvor",
  LOUVOR_ESPECIAL: "Louvor Especial",
  PREGACAO: "Pregação",
  TESTEMUNHO: "Testemunho",
  APOIO: "Apoio",
};

function yyyyMMddUTC(d = new Date()) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toBRDateFromYYYYMMDD(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function dateKeyFromISO(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "0000-00-00";
  return yyyyMMddUTC(d);
}

export default function EscalaPage() {
  const [days, setDays] = useState<number>(60);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);

  const [items, setItems] = useState<EscalaItem[]>([]);

  const start = useMemo(() => yyyyMMddUTC(new Date()), []);

  const grouped = useMemo(() => {
    const map = new Map<string, EscalaItem[]>();
    for (const it of items) {
      const key = dateKeyFromISO(it.dataEvento);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a > b ? 1 : -1));
  }, [items]);

  const fetchEscala = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch(`/api/escala?days=${days}&start=${start}`, { cache: "no-store" });
      const json = (await res.json()) as ApiResponse;

      if (!json?.ok) {
        toast.error(json?.error ?? "Falha ao carregar escala");
        setItems([]);
        return;
      }

      setItems(json.items ?? []);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao carregar escala");
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days, start]);

  const importFromGoogle = useCallback(async () => {
    try {
      setImporting(true);

      const res = await fetch("/api/escala/importar-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });

      const json = (await res.json()) as ImportResponse;

      if (!res.ok || !json?.ok) {
        console.error("Import error:", json);
        toast.error(json?.error ?? "Falha ao importar do Google Calendar");
        return;
      }

      const t = json.totals;
      const msg = t
        ? `Importado do Google: ${t.created} criados, ${t.updated} atualizados, ${t.ignored} ignorados (eventos: ${t.googleEvents}).`
        : "Importação concluída.";

      toast.success(msg);

      // após importar, recarrega a lista
      await fetchEscala();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao importar do Google Calendar");
    } finally {
      setImporting(false);
    }
  }, [days, fetchEscala]);

  useEffect(() => {
    fetchEscala();
  }, [fetchEscala]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Escala</h1>
          <p className="text-gray-600 mt-2">
            Agenda por data ({days} dias por padrão). Clique em um dia para editar.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            className="h-11 border border-gray-200 rounded-lg px-3 bg-white text-gray-900"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            disabled={refreshing || importing}
          >
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>

          <Button
            variant="secondary"
            onClick={importFromGoogle}
            loading={importing}
            disabled={refreshing || importing}
            title="Importa eventos do Google Calendar para gerar/atualizar escalas no sistema"
          >
            <DownloadCloud className={cn("w-4 h-4", importing && "animate-pulse")} />
            Importar do Google
          </Button>

          <Button
            variant="secondary"
            onClick={fetchEscala}
            loading={refreshing}
            disabled={refreshing || importing}
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-gray-600" />
          <h2 className="text-xl font-semibold text-gray-900">Próximos dias</h2>
        </div>

        <div className="px-6 py-6">
          {loading ? (
            <div className="text-gray-600">Carregando...</div>
          ) : grouped.length === 0 ? (
            <div className="text-gray-600">Nenhum item no período.</div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([date, list]) => (
                <div key={date} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold text-gray-900">
                      {toBRDateFromYYYYMMDD(date)}
                    </div>
                    <div className="text-sm text-gray-500">{list.length} item(ns)</div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {list.map((it) => (
                      <div
                        key={it.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2"
                      >
                        <div className="font-medium text-gray-900">
                          {tipoLabel[it.tipo] ?? it.tipo}:{" "}
                          <span className="font-semibold">{it.nomeResponsavel}</span>
                        </div>

                        {it.mensagem ? (
                          <div className="text-sm text-gray-600 sm:max-w-[55%] sm:text-right">
                            {it.mensagem}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400 sm:text-right">—</div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* (Depois entramos aqui com o modal “clicar no dia para editar”) */}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
