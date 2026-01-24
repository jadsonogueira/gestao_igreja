"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw, CalendarDays, Link2, X } from "lucide-react";
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

type MemberOption = {
  id: string;
  nome: string;
  email?: string | null;
};

type MembersResponse = {
  ok: boolean;
  error?: string;
  items?: MemberOption[];
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

  const [items, setItems] = useState<EscalaItem[]>([]);

  // Members (para vínculo)
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Modal
  const [open, setOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EscalaItem | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [nomeResponsavelRaw, setNomeResponsavelRaw] = useState<string>("");
  const [saving, setSaving] = useState(false);

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

  const fetchMembers = useCallback(async () => {
    try {
      setMembersLoading(true);
      const res = await fetch("/api/members/options", { cache: "no-store" });
      const json = (await res.json()) as MembersResponse;

      if (!json?.ok) {
        toast.error(json?.error ?? "Falha ao carregar membros");
        setMembers([]);
        return;
      }

      setMembers(json.items ?? []);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao carregar membros");
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEscala();
  }, [fetchEscala]);

  useEffect(() => {
    // carrega membros uma vez ao abrir a tela
    fetchMembers();
  }, [fetchMembers]);

  const openLinkModal = useCallback(
    (it: EscalaItem) => {
      setSelectedItem(it);
      setNomeResponsavelRaw(it.nomeResponsavel ?? "");
      setSelectedMemberId(""); // começa vazio; você pode escolher manualmente
      setMemberSearch("");
      setOpen(true);
    },
    []
  );

  const closeModal = useCallback(() => {
    setOpen(false);
    setSelectedItem(null);
    setSelectedMemberId("");
    setMemberSearch("");
    setNomeResponsavelRaw("");
    setSaving(false);
  }, []);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.nome.toLowerCase().includes(q));
  }, [members, memberSearch]);

  const saveLink = useCallback(async () => {
    if (!selectedItem) return;

    try {
      setSaving(true);

      // Se escolheu member: envia membroId
      // Se não escolheu: membroId = null (limpa vínculo)
      // Sempre envia nomeResponsavelRaw (texto livre) para manter fallback coerente
      const payload: any = {
        nomeResponsavelRaw: nomeResponsavelRaw?.trim() || null,
      };

      if (selectedMemberId) {
        payload.membroId = selectedMemberId;
      } else {
        payload.membroId = null;
      }

      const res = await fetch(`/api/escala/${selectedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        console.error("PATCH error:", json);
        toast.error(json?.error ?? "Falha ao salvar vínculo");
        return;
      }

      toast.success("Responsável vinculado com sucesso.");
      await fetchEscala();
      closeModal();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao salvar vínculo");
    } finally {
      setSaving(false);
    }
  }, [selectedItem, selectedMemberId, nomeResponsavelRaw, fetchEscala, closeModal]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Escala</h1>
          <p className="text-gray-600 mt-2">
            Agenda por data ({days} dias por padrão). Clique em um item para vincular.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            className="h-11 border border-gray-200 rounded-lg px-3 bg-white text-gray-900"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            disabled={refreshing}
          >
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>

          <Button variant="secondary" onClick={fetchEscala} loading={refreshing}>
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

          <div className="ml-auto text-sm text-gray-500">
            {membersLoading ? "Carregando membros..." : `${members.length} membros`}
          </div>
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
                      <button
                        key={it.id}
                        onClick={() => openLinkModal(it)}
                        className="w-full text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-50 hover:bg-gray-100 transition rounded-lg px-3 py-2"
                        title="Clique para vincular o responsável a um membro do banco"
                      >
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          <Link2 className="w-4 h-4 text-gray-500" />
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
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL - Vincular */}
      {open && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={closeModal} />

          <div className="relative w-[min(720px,92vw)] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  Vincular responsável
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {tipoLabel[selectedItem.tipo] ?? selectedItem.tipo} —{" "}
                  {new Date(selectedItem.dataEvento).toLocaleDateString("pt-BR")}
                </div>
              </div>

              <button
                onClick={closeModal}
                className="p-2 rounded-lg hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X className="w-5 h-5 text-gray-700" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Responsável (texto livre)
                </label>
                <input
                  value={nomeResponsavelRaw}
                  onChange={(e) => setNomeResponsavelRaw(e.target.value)}
                  className="w-full h-11 border border-gray-200 rounded-lg px-3 bg-white text-gray-900"
                  placeholder="Ex: Ir. Renata"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Isso é o fallback. Mesmo vinculado a um membro, mantemos esse texto.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vincular a um membro do banco (opcional)
                </label>

                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full h-11 border border-gray-200 rounded-lg px-3 bg-white text-gray-900 mb-2"
                  placeholder="Pesquisar membro (ex: Sylvia)"
                />

                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="w-full h-11 border border-gray-200 rounded-lg px-3 bg-white text-gray-900"
                >
                  <option value="">— não vincular (usar apenas texto) —</option>
                  {filteredMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}{m.email ? ` (${m.email})` : ""}
                    </option>
                  ))}
                </select>

                <p className="text-xs text-gray-500 mt-1">
                  Se você escolher um membro, o sistema passa a ter <b>membroId</b> para automações.
                </p>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={closeModal} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={saveLink} loading={saving}>
                Salvar vínculo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
