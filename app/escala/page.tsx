'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarDays, RefreshCw, Settings, Save, X, Search, User } from 'lucide-react';
import Button from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EscalaTipo } from '@/lib/types';

type DayRoleItem = {
  id?: string;
  tipo: EscalaTipo;
  nomeResponsavel: string; // pode vir vazio quando “limpo”
  mensagem?: string | null; // mensagem opcional no app
};

type EscalaDay = {
  date: string; // YYYY-MM-DD
  roles: Partial<Record<EscalaTipo, DayRoleItem>>;
};

type ApiDaysResponse =
  | { success: true; data: { days: EscalaDay[]; range: { days: number } } }
  | { success: false; error?: string };

type MemberItem = {
  id: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
};

const ROLE_OPTIONS: Array<{ value: EscalaTipo; label: string }> = [
  { value: 'DIRIGENTE', label: 'Dirigente' },
  { value: 'LOUVOR', label: 'Louvor' },
  { value: 'LOUVOR_ESPECIAL', label: 'Louvor Especial' },
  { value: 'PREGACAO', label: 'Pregação' },
  { value: 'TESTEMUNHO', label: 'Testemunho' },
];

function fmtDateBR(yyyyMmDd: string) {
  // yyyy-mm-dd -> dd/mm/yyyy
  const [y, m, d] = yyyyMmDd.split('-').map((p) => Number(p));
  if (!y || !m || !d) return yyyyMmDd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, ' ').trim();
}

export default function EscalaPage() {
  const [days, setDays] = useState<EscalaDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // range selector
  const [rangeDays, setRangeDays] = useState<number>(60);

  // modal
  const [open, setOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<EscalaDay | null>(null);
  const [saving, setSaving] = useState(false);

  // members (autocomplete)
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState<string>('');

  // form state inside modal
  const [formNames, setFormNames] = useState<Record<string, string>>({});
  const [formMensagem, setFormMensagem] = useState<string>('');

  const filteredMembers = useMemo(() => {
    const q = normalizeSpaces(memberSearch).toLowerCase();
    if (!q) return members.slice(0, 30);
    return members
      .filter((m) => normalizeSpaces(m.nome).toLowerCase().includes(q))
      .slice(0, 30);
  }, [memberSearch, members]);

  const fetchDays = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch(`/api/escala/dia?days=${rangeDays}`, { cache: 'no-store' });
      const json = (await res.json()) as ApiDaysResponse;

      if (!('success' in json) || json.success !== true) {
        toast.error((json as any)?.error ?? 'Falha ao carregar escala');
        return;
      }

      setDays(json.data.days ?? []);
    } catch (e) {
      console.error(e);
      toast.error('Falha ao carregar escala');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rangeDays]);

  const fetchMembers = useCallback(async (search = '') => {
    try {
      setMembersLoading(true);
      // usa sua rota existente de membros:
      // /api/members?search=&status=ativo&page=1&limit=200
      const qs = new URLSearchParams();
      qs.set('search', search);
      qs.set('status', 'ativo');
      qs.set('page', '1');
      qs.set('limit', '200');

      const res = await fetch(`/api/members?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();

      // compatível com respostas comuns:
      // { success: true, data: { items: [...] } }
      const items = json?.data?.items ?? json?.items ?? [];
      setMembers(items);
    } catch (e) {
      console.error(e);
      // não trava a tela se falhar
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDays();
  }, [fetchDays]);

  const openDayModal = async (day: EscalaDay) => {
    setSelectedDay(day);

    const initialNames: Record<string, string> = {};
    for (const r of ROLE_OPTIONS) {
      initialNames[r.value] = normalizeSpaces(day.roles?.[r.value]?.nomeResponsavel ?? '');
    }

    // mensagem opcional por dia (aqui usamos a mensagem do primeiro item encontrado, se existir)
    const anyMsg =
      day.roles?.DIRIGENTE?.mensagem ??
      day.roles?.LOUVOR?.mensagem ??
      day.roles?.LOUVOR_ESPECIAL?.mensagem ??
      day.roles?.PREGACAO?.mensagem ??
      day.roles?.TESTEMUNHO?.mensagem ??
      '';

    setFormNames(initialNames);
    setFormMensagem(anyMsg ? String(anyMsg) : '');
    setMemberSearch('');
    setOpen(true);

    // carrega membros ao abrir (1x)
    if (members.length === 0) {
      await fetchMembers('');
    }
  };

  const closeModal = () => {
    setOpen(false);
    setSelectedDay(null);
    setFormNames({});
    setFormMensagem('');
    setMemberSearch('');
  };

  const setRoleName = (role: EscalaTipo, value: string) => {
    setFormNames((prev) => ({ ...prev, [role]: value }));
  };

  const onSaveDay = async () => {
    if (!selectedDay) return;

    setSaving(true);
    try {
      const payload = {
        date: selectedDay.date, // YYYY-MM-DD
        // “limpar” = mandar vazio (não deletar evento no Google, só limpar no app)
        roles: ROLE_OPTIONS.reduce((acc, r) => {
          acc[r.value] = normalizeSpaces(formNames[r.value] ?? '');
          return acc;
        }, {} as Record<EscalaTipo, string>),
        mensagem: formMensagem?.trim() ? formMensagem.trim() : null,
      };

      const res = await fetch('/api/escala/dia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json?.success) {
        toast.success('Escala do dia salva ✅');
        closeModal();
        fetchDays();
      } else {
        toast.error(json?.error ?? 'Falha ao salvar escala');
      }
    } catch (e) {
      console.error(e);
      toast.error('Falha ao salvar escala');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-gray-600">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="ml-2">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Escala</h1>
          <p className="text-gray-600 mt-1">
            Agenda por data ({rangeDays} dias por padrão). Clique em um dia para editar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
          >
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>

          <Button variant="secondary" onClick={fetchDays} loading={refreshing}>
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Days list */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
        <div className="p-5 border-b border-gray-100 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Próximos dias</h2>
        </div>

        <div className="divide-y divide-gray-100">
          {days.length === 0 ? (
            <div className="p-6 text-gray-600">Nenhum item no período.</div>
          ) : (
            days.map((d) => {
              const hasAny =
                !!normalizeSpaces(d.roles?.DIRIGENTE?.nomeResponsavel ?? '') ||
                !!normalizeSpaces(d.roles?.LOUVOR?.nomeResponsavel ?? '') ||
                !!normalizeSpaces(d.roles?.LOUVOR_ESPECIAL?.nomeResponsavel ?? '') ||
                !!normalizeSpaces(d.roles?.PREGACAO?.nomeResponsavel ?? '') ||
                !!normalizeSpaces(d.roles?.TESTEMUNHO?.nomeResponsavel ?? '');

              return (
                <button
                  key={d.date}
                  onClick={() => openDayModal(d)}
                  className={cn(
                    'w-full text-left p-5 hover:bg-gray-50 transition',
                    !hasAny && 'opacity-90'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm text-gray-500">{fmtDateBR(d.date)}</div>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {ROLE_OPTIONS.map((r) => {
                          const name = normalizeSpaces(d.roles?.[r.value]?.nomeResponsavel ?? '');
                          return (
                            <div
                              key={r.value}
                              className={cn(
                                'rounded-lg border px-3 py-2 text-sm',
                                name ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50'
                              )}
                            >
                              <div className="text-xs text-gray-500">{r.label}</div>
                              <div className={cn('font-medium', name ? 'text-gray-900' : 'text-gray-400')}>
                                {name || '—'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-gray-500">
                      <Settings className="w-4 h-4" />
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Modal */}
      {open && selectedDay ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative w-[95vw] max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-100">
            <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-gray-500">{fmtDateBR(selectedDay.date)}</div>
                <div className="text-lg font-semibold text-gray-900">Editar escala do dia</div>
                <p className="text-sm text-gray-600 mt-1">
                  Dica: você pode digitar exatamente como está no banco ou escolher na lista.
                  <br />
                  Para <b>limpar</b> uma função, deixe o nome vazio (não exclui evento no Google, só limpa no app).
                </p>
              </div>

              <button
                onClick={closeModal}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-700"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* members search */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Pesquisar membro (para ajudar a preencher)"
                    className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => fetchMembers(memberSearch)}
                  loading={membersLoading}
                >
                  Buscar
                </Button>
              </div>

              {/* quick pick list */}
              {filteredMembers.length > 0 ? (
                <div className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                  <div className="text-xs text-gray-500 mb-2">
                    Sugestões (clique para copiar o nome):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {filteredMembers.map((m) => (
                      <button
                        key={m.id}
                        className="px-3 py-1.5 rounded-full border border-gray-200 bg-white text-sm hover:bg-gray-100 flex items-center gap-2"
                        onClick={() => {
                          // só copia para o clipboard (pra você colar no campo que quiser)
                          navigator.clipboard?.writeText(m.nome).catch(() => {});
                          toast('Nome copiado: ' + m.nome);
                        }}
                        type="button"
                      >
                        <User className="w-4 h-4 text-gray-400" />
                        {m.nome}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* role inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ROLE_OPTIONS.map((r) => (
                  <div key={r.value}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{r.label}</label>
                    <input
                      value={formNames[r.value] ?? ''}
                      onChange={(e) => setRoleName(r.value, e.target.value)}
                      placeholder={`${r.label}: nome do responsável`}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      Formato usado no Google: <b>{r.label}: Nome</b>
                    </div>
                  </div>
                ))}
              </div>

              {/* mensagem opcional */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mensagem opcional (fica só no app)
                </label>
                <textarea
                  rows={3}
                  value={formMensagem}
                  onChange={(e) => setFormMensagem(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: trazer instrumento / chegar 30min antes / tema do culto..."
                />
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={closeModal}>
                Cancelar
              </Button>
              <Button onClick={onSaveDay} loading={saving}>
                <Save className="w-4 h-4" />
                Salvar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
