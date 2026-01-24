"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  RefreshCw,
  CalendarDays,
  Link2,
  X,
  Clock,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import Button from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EscalaTipo } from "@/lib/types";

type EscalaItem = {
  id: string;
  tipo: EscalaTipo;
  dataEvento: string; // ISO
  nomeResponsavel: string;
  mensagem?: string | null;

  membroId?: string | null;
  membroNome?: string | null;
  nomeResponsavelRaw?: string | null;

  // Etapa 3
  envioAutomatico?: boolean;
  enviarEm?: string; // ISO
  status?: string | null;
  erroMensagem?: string | null;
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

type PatchResponse = {
  ok: boolean;
  error?: string;
  item?: Partial<EscalaItem> & {
    enviarEm?: string | null;
    membroId?: string | null;
    membroNome?: string | null;
    nomeResponsavelRaw?: string | null;
    mensagem?: string | null;
    envioAutomatico?: boolean;
    status?: string | null;
    erroMensagem?: string | null;
  };
};

type SendNowResponse = {
  ok: boolean;
  error?: string;
  message?: string;
};

// Resposta do import (rota /api/escala/importar-google)
type ImportResponse = {
  ok?: boolean;
  connected?: boolean;
  reason?: string;
  error?: string;
  totals?: {
    googleEvents: number;
    parsed: number;
    created: number;
    updated: number;
    ignored: number;
  };
  details?: any;
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

// ISO -> input datetime-local (YYYY-MM-DDTHH:mm)
function isoToLocalInputValue(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

// input datetime-local -> ISO UTC
function localInputToISO(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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

  // vínculo
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [nomeResponsavelRaw, setNomeResponsavelRaw] = useState<string>("");

  // Etapa 3
  const [envioAutomatico, setEnvioAutomatico] = useState<boolean>(true);
  const [enviarEmLocal, setEnviarEmLocal] = useState<string>("");
  const [mensagem, setMensagem] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);

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

  // ✅ 1) Importa do Google Calendar
  const importFromGoogle = useCallback(async () => {
    try {
      const res = await fetch("/api/escala/importar-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // days define o intervalo que vamos importar (ex: próximos 60/90 dias)
        body: JSON.stringify({ days }),
      });

      const json = (await res.json().catch(() => ({}))) as ImportResponse;

      // Sua rota retorna 200 mesmo com erro do Google e usa connected:false
      if (json?.connected === false) {
        // Mostra erro “bonito”, mas não trava o resto do refresh
        toast.error("Falha ao importar do Google Calendar (verifique credenciais).");
        console.error("[importar-google] connected:false", json);
        return { ok: false, json };
      }

      if (json?.ok === false) {
        toast.error(json?.error ?? "Falha ao importar do Google Calendar");
        console.error("[importar-google] ok:false", json);
        return { ok: false, json };
      }

      const t = json?.totals;
      if (t) {
        toast.success(
          `Importado do Google: +${t.created} criado(s), ${t.updated} atualizado(s), ${t.ignored} ignorado(s).`
        );
      } else {
        toast.success("Importação do Google concluída.");
      }

      return { ok: true, json };
    } catch (e) {
      console.error(e);
      toast.error("Falha ao importar do Google Calendar");
      return { ok: false, json: null };
    }
  }, [days]);

  // ✅ 2) Busca do banco (o que já existia)
  const fetchEscalaOnly = useCallback(async () => {
    const res = await fetch(`/api/escala?days=${days}&start=${start}`, { cache: "no-store" });
    const json = (await res.json()) as ApiResponse;

    if (!json?.ok) {
      throw new Error(json?.error ?? "Falha ao carregar escala");
    }

    setItems(json.items ?? []);
  }, [days, start]);

  // ✅ Botão Atualizar = Importa Google + Recarrega lista
  const refreshAll = useCallback(async () => {
    try {
      setRefreshing(true);

      // 1) importa
      await importFromGoogle();

      // 2) recarrega lista do banco
      await fetchEscalaOnly();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Falha ao carregar escala");
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [importFromGoogle, fetchEscalaOnly]);

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

  // Primeira carga: pode decidir se quer importar sempre ou não.
  // Aqui eu NÃO importo automaticamente na primeira carga para evitar “bater no Google” sozinho.
  // Eu só carrego do banco; o usuário clica em Atualizar quando quiser import.
  const initialLoad = useCallback(async () => {
    try {
      setLoading(true);
      await fetchEscalaOnly();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Falha ao carregar escala");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fetchEscalaOnly]);

  useEffect(() => {
    initialLoad();
  }, [initialLoad]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const openModal = useCallback((it: EscalaItem) => {
    setSelectedItem(it);

    // vínculo
    setNomeResponsavelRaw(it.nomeResponsavel ?? "");
    setSelectedMemberId(it.membroId ?? "");
    setMemberSearch("");

    // Etapa 3 (defaults do item)
    setEnvioAutomatico(it.envioAutomatico ?? true);
    setEnviarEmLocal(isoToLocalInputValue(it.enviarEm));
    setMensagem((it.mensagem ?? "").toString());

    setOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setOpen(false);
    setSelectedItem(null);

    setSelectedMemberId("");
    setMemberSearch("");
    setNomeResponsavelRaw("");

    setEnvioAutomatico(true);
    setEnviarEmLocal("");
    setMensagem("");

    setSaving(false);
    setSendingNow(false);
  }, []);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.nome.toLowerCase().includes(q));
  }, [members, memberSearch]);

  const canSendNow = useMemo(
    () => Boolean(selectedMemberId || selectedItem?.membroId),
    [selectedMemberId, selectedItem]
  );

  const buildPayload = useCallback(() => {
    let enviarEmISO: string | null = null;
    if (enviarEmLocal.trim()) {
      enviarEmISO = localInputToISO(enviarEmLocal.trim());
      if (!enviarEmISO) {
        toast.error("Data/hora de disparo inválida.");
        return null;
      }
    }

    const payload: any = {
      nomeResponsavelRaw: nomeResponsavelRaw?.trim() || null,
      envioAutomatico: !!envioAutomatico,
      mensagem: mensagem?.trim() || null,
      membroId: selectedMemberId || null,
    };

    if (enviarEmISO) payload.enviarEm = enviarEmISO;

    return payload;
  }, [selectedMemberId, nomeResponsavelRaw, envioAutomatico, enviarEmLocal, mensagem]);

  const persistChanges = useCallback(async () => {
    if (!selectedItem) return null;

    const payload = buildPayload();
    if (!payload) return null;

    const res = await fetch(`/api/escala/${selectedItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => ({}))) as PatchResponse;

    if (!res.ok || !json?.ok) {
      console.error("PATCH error:", json);
      toast.error(json?.error ?? "Falha ao salvar");
      return null;
    }

    if (json.item) {
      setSelectedItem((prev) => (prev ? { ...prev, ...json.item } : prev));
    }

    return json.item ?? null;
  }, [selectedItem, buildPayload]);

  const saveAll = useCallback(async () => {
    if (!selectedItem) return;

    try {
      setSaving(true);
      const updated = await persistChanges();
      if (!updated) return;

      toast.success("Escala atualizada.");
      await fetchEscalaOnly();
      closeModal();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }, [selectedItem, persistChanges, fetchEscalaOnly, closeModal]);

  const sendNow = useCallback(async () => {
    if (!selectedItem) return;

    if (!canSendNow) {
      toast.error("Vincule a escala a um membro antes de enviar.");
      return;
    }

    try {
      setSendingNow(true);

      const updated = await persistChanges();
      if (!updated) return;

      const res = await fetch(`/api/escala/${selectedItem.id}/enviar-agora`, {
        method: "POST",
      });

      const json = (await res.json().catch(() => ({}))) as SendNowResponse;

      if (!res.ok || !json?.ok) {
        console.error("send-now error:", json);
        toast.error(json?.error ?? "Falha ao enviar agora");
        return;
      }

      toast.success(json?.message ?? "Envio disparado.");
      await fetchEscalaOnly();
      setSelectedItem((prev) =>
        prev ? { ...prev, status: "ENVIADO", erroMensagem: null } : prev
      );
    } catch (e) {
      console.error(e);
      toast.error("Falha ao enviar agora");
    } finally {
      setSendingNow(false);
    }
  }, [selectedItem, canSendNow, persistChanges, fetchEscalaOnly]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Escala</h1>
          <p className="text-gray-600 mt-2">
            Agenda por data ({days} dias por padrão). Clique em um item para editar.
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

          {/* ✅ Atualizar = Import Google + Recarregar */}
          <Button variant="secondary" onClick={refreshAll} loading={refreshing}>
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
                        onClick={() => openModal(it)}
                        className="w-full text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-50 hover:bg-gray-100 transition rounded-lg px-3 py-2"
                        title="Clique para editar/vincular"
                      >
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          <Link2 className="w-4 h-4 text-gray-500" />
                          {tipoLabel[it.tipo] ?? it.tipo}:{" "}
                          <span className="font-semibold">{it.nomeResponsavel}</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {it.enviarEm
                              ? new Date(it.enviarEm).toLocaleString("pt-BR")
                              : "sem horário"}
                          </div>
                          <div
                            className={cn(
                              "text-xs font-medium px-2 py-1 rounded-full",
                              it.envioAutomatico
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-200 text-gray-700"
                            )}
                          >
                            {it.envioAutomatico ? "Auto" : "Manual"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL */}
      {open && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={closeModal} />

          <div className="relative w-[min(780px,92vw)] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-gray-900">Editar escala</div>
                <div className="text-sm text-gray-600 mt-1">
                  {tipoLabel[selectedItem.tipo] ?? selectedItem.tipo} —{" "}
                  {new Date(selectedItem.dataEvento).toLocaleDateString("pt-BR")}
                </div>
              </div>

              <button
                onClick={closeModal}
                className="p-2 rounded-lg hover:bg-gray-100"
                aria-label="Fechar"
                disabled={saving || sendingNow}
              >
                <X className="w-5 h-5 text-gray-700" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-5">
              {/* Responsável (texto) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Responsável (texto livre)
                </label>
                <input
                  value={nomeResponsavelRaw}
                  onChange={(e) => setNomeResponsavelRaw(e.target.value)}
                  className="w-full h-11 border border-gray-200 rounded-lg px-3 bg-white text-gray-900"
                  placeholder="Ex: Ir. Renata"
                  disabled={saving || sendingNow}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Mantemos isso como fallback mesmo quando há vínculo.
                </p>
              </div>

              {/* Vincular member */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vincular a um membro do banco (opcional)
                </label>

                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full h-11 border border-gray-200 rounded-lg px-3 bg-white text-gray-900 mb-2"
                  placeholder="Pesquisar membro (ex: Sylvia)"
                  disabled={saving || sendingNow}
                />

                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="w-full h-11 border border-gray-200 rounded-lg px-3 bg-white text-gray-900"
                  disabled={saving || sendingNow}
                >
                  <option value="">— não vincular (usar apenas texto) —</option>
                  {filteredMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                      {m.email ? ` (${m.email})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Programação */}
              <div className="border border-gray-100 rounded-xl p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-gray-600" />
                    Programação do disparo
                  </div>

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={sendNow}
                      loading={sendingNow}
                      disabled={saving || sendingNow || !canSendNow}
                    >
                      Enviar agora
                    </Button>

                    <button
                      type="button"
                      onClick={() => setEnvioAutomatico((v) => !v)}
                      disabled={saving || sendingNow}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg border",
                        envioAutomatico
                          ? "border-green-200 bg-green-50"
                          : "border-gray-200 bg-gray-50",
                        (saving || sendingNow) && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      {envioAutomatico ? (
                        <ToggleRight className="w-5 h-5 text-green-600" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-gray-600" />
                      )}
                      <span className="text-sm font-medium text-gray-800">
                        {envioAutomatico ? "Envio automático: ON" : "Envio automático: OFF"}
                      </span>
                    </button>
                  </div>
                </div>

                {!canSendNow && (
                  <p className="text-xs text-amber-700">
                    Para enviar agora, vincule esta escala a um membro.
                  </p>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Disparar em (data/hora)
                  </label>
                  <input
                    type="datetime-local"
                    value={enviarEmLocal}
                    onChange={(e) => setEnviarEmLocal(e.target.value)}
                    className="w-full h-11 border border-gray-200 rounded-lg px-3 bg-white text-gray-900"
                    disabled={saving || sendingNow}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Esse horário controla quando o scheduler vai disparar (1 por execução).
                  </p>
                </div>
              </div>

              {/* Mensagem */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mensagem (opcional)
                </label>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-900"
                  placeholder="Ex: Chegar 30 min antes..."
                  disabled={saving || sendingNow}
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={closeModal} disabled={saving || sendingNow}>
                Cancelar
              </Button>
              <Button onClick={saveAll} loading={saving} disabled={sendingNow}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
