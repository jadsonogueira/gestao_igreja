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
  error?: string;
  details?: string;
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
    DIRIGENTE: "border-amber-300 bg-amber-50 text-amber-900",
    LOUVOR: "border-emerald-300 bg-emerald-50 text-emerald-900",
    LOUVOR_ESPECIAL: "border-sky-300 bg-sky-50 text-sky-900",
    PREGACAO: "border-violet-300 bg-violet-50 text-violet-900",
    TESTEMUNHO: "border-pink-300 bg-pink-50 text-pink-900",
    APOIO: "border-slate-300 bg-slate-50 text-slate-900",
  };
  return map[tipo] ?? "border-slate-300 bg-slate-50 text-slate-900";
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

      if (!json.ok) {
        throw new Error(json.error || "Falha ao carregar escala");
      }

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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Escala</h1>
          <p className="text-sm text-gray-600 mt-1">
            Agenda por data ({days} dias). Clique em um dia para editar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
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
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Atualizar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-4 border border-gray-100">
        {loading ? (
          <p className="text-sm text-gray-600">Carregando…</p>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">
            {error}
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-gray-600">Nenhum item no período.</p>
        ) : (
          <div className="space-y-5">
            {data.map((day) => (
              <div
                key={day.date}
                className="cursor-pointer rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50"
                onClick={() => setSelectedDate(day.date)}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">
                    {formatDatePt(day.date)}
                    <span className="ml-2 text-xs text-gray-500">{day.date}</span>
                  </div>
                  <div className="text-xs text-gray-500">{day.items.length} função(ões)</div>
                </div>

                <div className="mt-3 space-y-2">
                  {day.items.length === 0 ? (
                    <div className="text-sm text-gray-500 italic">Nada planejado. Toque para criar.</div>
                  ) : (
                    day.items.map((it) => (
                      <div
                        key={it.id}
                        className={`rounded-lg border px-3 py-2 ${roleColor(it.tipo)}`}
                      >
                        <span className="font-semibold">{roleLabel(it.tipo)}:</span>{" "}
                        {it.nome}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal (editor vem na próxima fase) */}
      {selectedDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedDate(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">Editar dia</div>
                <div className="text-sm text-gray-600">
                  {formatDatePt(selectedDay.date)} ({selectedDay.date})
                </div>
              </div>
              <button
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => setSelectedDate(null)}
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 text-sm text-gray-700">
              Próxima etapa:
              <ul className="mt-2 list-disc pl-5 text-gray-600">
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
  );
}
