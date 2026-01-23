"use client";

import { useEffect, useMemo, useState } from "react";

type EscalaItem = {
  id: string;
  tipo: string;
  nome: string;
  mensagem: string | null;
  envioAutomatico: boolean;
  enviarEm: string;
  status: string;
};

type EscalaDay = {
  date: string; // YYYY-MM-DD
  items: EscalaItem[];
};

type ApiResponse = {
  ok: boolean;
  data: EscalaDay[];
};

function formatDatePt(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(d);
}

function roleLabel(tipo: string) {
  const map: Record<string, string> = {
    DIRIGENTE: "Dirigente",
    LOUVOR: "Louvor",
    LOUVOR_ESPECIAL: "Louvor Especial",
    PREGACAO: "Pregação",
    TESTEMUNHO: "Testemunho",
    APOIO: "Apoio",
  };
  return map[tipo] ?? tipo;
}

function roleColor(tipo: string) {
  const map: Record<string, string> = {
    DIRIGENTE: "border-amber-400 bg-amber-500/10",
    LOUVOR: "border-emerald-400 bg-emerald-500/10",
    LOUVOR_ESPECIAL: "border-sky-400 bg-sky-500/10",
    PREGACAO: "border-violet-400 bg-violet-500/10",
    TESTEMUNHO: "border-pink-400 bg-pink-500/10",
    APOIO: "border-slate-400 bg-slate-500/10",
  };
  return map[tipo] ?? "border-slate-400 bg-slate-500/10";
}

export default function EscalaAgenda() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(60);
  const [data, setData] = useState<EscalaDay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const fetchAgenda = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/escala?days=${days}`, { cache: "no-store" });
      const json: ApiResponse = await res.json();
      if (!json.ok) throw new Error("Falha ao carregar escala");
      setData(json.data || []);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgenda();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const selectedDay = useMemo(() => {
    if (!selectedDate) return null;
    return data.find((d) => d.date === selectedDate) ?? { date: selectedDate, items: [] };
  }, [data, selectedDate]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Escala</h1>
            <p className="text-sm text-zinc-400">
              Agenda por data (60 dias por padrão). Clique em um dia para editar.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={30}>30 dias</option>
              <option value={60}>60 dias</option>
              <option value={90}>90 dias</option>
              <option value={120}>120 dias</option>
            </select>

            <button
              onClick={fetchAgenda}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
            >
              Atualizar
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          {loading ? (
            <p className="text-sm text-zinc-400">Carregando…</p>
          ) : error ? (
            <p className="text-sm text-red-300">{error}</p>
          ) : data.length === 0 ? (
            <p className="text-sm text-zinc-400">Nenhum item no período.</p>
          ) : (
            <div className="space-y-5">
              {data.map((day) => (
                <div
                  key={day.date}
                  className="cursor-pointer rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 hover:bg-zinc-950/70"
                  onClick={() => setSelectedDate(day.date)}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      {formatDatePt(day.date)}
                      <span className="ml-2 text-xs text-zinc-500">{day.date}</span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      {day.items.length} função(ões)
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {day.items.map((it) => (
                      <div
                        key={it.id}
                        className={`rounded-lg border px-3 py-2 ${roleColor(it.tipo)}`}
                      >
                        <span className="font-semibold">{roleLabel(it.tipo)}:</span>{" "}
                        {it.nome}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal (editor vem na próxima fase) */}
        {selectedDay && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setSelectedDate(null)}
          >
            <div
              className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">Editar dia</div>
                  <div className="text-sm text-zinc-400">
                    {formatDatePt(selectedDay.date)} ({selectedDay.date})
                  </div>
                </div>
                <button
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
                  onClick={() => setSelectedDate(null)}
                >
                  Fechar
                </button>
              </div>

              <div className="mt-4 text-sm text-zinc-300">
                Próxima etapa:
                <ul className="mt-2 list-disc pl-5 text-zinc-400">
                  <li>Buscar membros do banco</li>
                  <li>Editar responsável por função</li>
                  <li>Salvar no app</li>
                  <li>Sincronizar com Google somente ao clicar</li>
                  <li>Limpar função sem excluir evento</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
