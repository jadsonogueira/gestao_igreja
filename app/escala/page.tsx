'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarDays, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DayItem = {
  date: string; // YYYY-MM-DD
  // ex.: { DIRIGENTE: "Pra. Sylvia", LOUVOR: "Ir. Renata", ... }
  roles: Record<string, string | null | undefined>;
};

function ymdLocal(date: Date) {
  // YYYY-MM-DD no horário local (evita bug de UTC do toISOString)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtDatePtBr(ymd: string) {
  // ymd = YYYY-MM-DD
  const [y, m, d] = ymd.split('-').map((x) => Number(x));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' });
}

const rangeOptions = [
  { value: 30, label: '30 dias' },
  { value: 60, label: '60 dias' },
  { value: 90, label: '90 dias' },
];

export default function EscalaPage() {
  const todayYmd = useMemo(() => ymdLocal(new Date()), []);
  const [rangeDays, setRangeDays] = useState<number>(60);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [days, setDays] = useState<DayItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<any>(null);
  const [loadingDay, setLoadingDay] = useState(false);

  const fetchDays = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/escala?days=${rangeDays}`, { cache: 'no-store' });
      const json = await res.json();

      if (!res.ok || json?.success === false) {
        toast.error(json?.error ?? 'Falha ao carregar escala');
        setDays([]);
        return;
      }

      const items: DayItem[] = json?.data?.items ?? json?.items ?? [];
      setDays(items);
    } catch (e) {
      console.error(e);
      toast.error('Falha ao carregar escala');
      setDays([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rangeDays]);

  const fetchDay = useCallback(async (dateYmd: string) => {
    // garante YYYY-MM-DD
    const isValid = /^\d{4}-\d{2}-\d{2}$/.test(dateYmd);
    if (!isValid) {
      toast.error('date inválida (use YYYY-MM-DD)');
      return;
    }

    setSelectedDate(dateYmd);
    setLoadingDay(true);
    try {
      const res = await fetch(`/api/escala/dia?date=${encodeURIComponent(dateYmd)}`, { cache: 'no-store' });
      const json = await res.json();

      if (!res.ok || json?.success === false) {
        toast.error(json?.error ?? 'Falha ao carregar dia');
        setSelectedDay(null);
        return;
      }

      setSelectedDay(json?.data ?? json);
    } catch (e) {
      console.error(e);
      toast.error('Falha ao carregar dia');
      setSelectedDay(null);
    } finally {
      setLoadingDay(false);
    }
  }, []);

  useEffect(() => {
    fetchDays();
  }, [fetchDays]);

  // auto-seleciona hoje quando carregar lista (se existir)
  useEffect(() => {
    if (!loading && days.length > 0) {
      const hasToday = days.some((d) => d.date === todayYmd);
      if (hasToday && !selectedDate) {
        fetchDay(todayYmd);
      }
    }
  }, [loading, days, todayYmd, selectedDate, fetchDay]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Escala</h1>
          <p className="text-gray-600 mt-1">
            Agenda por data ({rangeDays} dias por padrão). Clique em um dia para editar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-900"
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
          >
            {rangeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <Button variant="secondary" onClick={fetchDays} loading={refreshing}>
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Próximos dias</h2>
        </div>

        {loading ? (
          <div className="p-6 text-gray-600">Carregando...</div>
        ) : days.length === 0 ? (
          <div className="p-6 text-gray-600">Nenhum item no período.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {days.map((d) => {
              const active = d.date === selectedDate;
              return (
                <button
                  key={d.date}
                  onClick={() => fetchDay(d.date)} // d.date já vem YYYY-MM-DD
                  className={cn(
                    'w-full text-left p-5 hover:bg-gray-50 transition',
                    active && 'bg-blue-50'
                  )}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="text-sm text-gray-500">{d.date}</div>
                      <div className="text-base font-semibold text-gray-900">
                        {fmtDatePtBr(d.date)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {Object.entries(d.roles ?? {}).map(([role, name]) => {
                        if (!name) return null;
                        return (
                          <span
                            key={role}
                            className="text-xs px-2 py-1 rounded-full border border-gray-200 bg-white text-gray-800"
                          >
                            {role}: {String(name).trim()}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Day detail (placeholder do modal/edição) */}
      {selectedDate ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-gray-500">Dia selecionado</div>
              <div className="text-lg font-semibold text-gray-900">{selectedDate}</div>
            </div>
            {loadingDay ? <div className="text-gray-600">Carregando…</div> : null}
          </div>

          {!loadingDay && selectedDay ? (
            <pre className="mt-4 text-xs bg-gray-50 border border-gray-100 rounded-xl p-4 overflow-auto">
              {JSON.stringify(selectedDay, null, 2)}
            </pre>
          ) : null}

          {!loadingDay && !selectedDay ? (
            <div className="mt-4 text-sm text-gray-600">
              Não há detalhes (ou falhou a busca do dia).
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
