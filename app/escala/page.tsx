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
  Send,
  Trash2,
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

  // vínculo
  membroId?: string | null;
  membroNome?: string | null;
  nomeResponsavelRaw?: string | null;

  // Etapa 3
  envioAutomatico?: boolean;
  enviarEm?: string; // ISO
};

type ApiResponse = {
  ok: boolean;
  error?: string;
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

type GoogleStatusResponse = {
  ok: boolean;
  connected?: boolean;
  error?: string;
  reason?: string;
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

function looksLikeOAuthProblem(json: any) {
  const s = JSON.stringify(json ?? {}).toLowerCase();
  return (
    s.includes("invalid_grant") ||
    s.includes("invalid grant") ||
    s.includes("oauth") ||
    s.includes("refresh token") ||
    s.includes("token")
  );
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
  const [deleting, setDeleting] = useState(false);

  // ✅ Enviar agora (loading por item)
  const [sendingNowId, setSendingNowId] = useState<string | null>(null);

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

  /**
   * ✅ Garante que OAuth foi iniciado do jeito certo:
   * - Se NÃO conectado → redireciona o navegador para /api/google/oauth/start
   * - Se conectado → segue normal
   */
  const ensureGoogleConnected = useCallback(async () => {
    try {
      const res = await fetch("/api/google/status", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as GoogleStatusResponse;

      if (!json?.ok) {
        toast.error(json?.error ?? "Falha ao checar conexão com Google");
        console.error("[google/status] ok:false", json);
        return false;
      }

      if (json?.connected === false) {
        toast("Conecte sua conta Google para importar a escala…");
        // ⚠️ OAuth precisa ser navegação do browser (não fetch)
        window.location.href = "/api/google/oauth/start";
        return false;
      }

      return true;
    } catch (e) {
      console.error(e);
      toast.error("Falha ao checar conexão com Google");
      return false;
    }
  }, []);

  // ✅ 1) Importa do Google Calendar
  const importFromGoogle = useCallback(async () => {
    try {
      const res = await fetch("/api/escala/importar-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });

      const json = (await res.json().catch(() => ({}))) as ImportResponse;

      // Se backend indicar desconectado, iniciamos OAuth do jeito certo
      if (json?.connected === false) {
        toast("Google não conectado. Vamos autorizar novamente…");
        console.error("[importar-google] connected:false", json);
        window.location.href = "/api/google/oauth/start";
        return { ok: false, json };
      }

      if (json?.ok === false) {
        // Se for cara de problema OAuth (invalid_grant etc), força reauth
        if (looksLikeOAuthProblem(json)) {
          toast("Credenciais do Google expiraram. Vamos autorizar novamente…");
          console.error("[importar-google] oauth problem", json);
          window.location.href = "/api/google/oauth/start";
          return { ok: false, json };
        }

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

  // ✅ 2) Busca do banco
  const fetchEscalaOnly = useCallback(async () => {
    const res = await fetch(`/api/escala?days=${days}&start=${start}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as ApiResponse;

    if (!json?.ok) {
      throw new Error(json?.error ?? "Falha ao carregar escala");
    }

    setItems(json.items ?? []);
  }, [days, start]);

  // ✅ Atualizar = (se precisar, autoriza Google) + Importa + Recarrega lista
  const refreshAll = useCallback(async () => {
    try {
      setRefreshing(true);

      // 🔒 1) garante conexão Google (se não, redireciona e para)
      const okGoogle = await ensureGoogleConnected();
      if (!okGoogle) return;

      // 🔁 2) importa e depois carrega do banco
      await importFromGoogle();
      await fetchEscalaOnly();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Falha ao carregar escala");
      setItems([]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchEscalaOnly, importFromGoogle, ensureGoogleConnected]);

  // ✅ Members: rota correta para options
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

    setNomeResponsavelRaw(
      (it.nomeResponsavelRaw ?? it.nomeResponsavel ?? "").toString()
    );
    setSelectedMemberId((it.membroId ?? "").toString());
    setMemberSearch("");

    setEnvioAutomatico(it.envioAutomatico ?? true);
    setEnviarEmLocal(isoToLocalInputValue(it.enviarEm));
    setMensagem((it.mensagem ?? "").toString());

    setOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (saving || deleting) return;

    setOpen(false);
    setSelectedItem(null);

    setSelectedMemberId("");
    setMemberSearch("");
    setNomeResponsavelRaw("");

    setEnvioAutomatico(true);
    setEnviarEmLocal("");
    setMensagem("");

    setSaving(false);
    setDeleting(false);
  }, [saving, deleting]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.nome.toLowerCase().includes(q));
  }, [members, memberSearch]);

  const saveAll = useCallback(async () => {
    if (!selectedItem) return;

    let enviarEmISO: string | null = null;
    if (enviarEmLocal.trim()) {
      enviarEmISO = localInputToISO(enviarEmLocal.trim());
      if (!enviarEmISO) {
        toast.error("Data/hora de disparo inválida.");
        return;
      }
    }

    try {
      setSaving(true);

      const payload: any = {
        nomeResponsavelRaw: nomeResponsavelRaw?.trim() || null,
        envioAutomatico: !!envioAutomatico,
        mensagem: mensagem?.trim() || null,
      };

      if (enviarEmISO) payload.enviarEm = enviarEmISO;

      payload.membroId = selectedMemberId ? selectedMemberId : null;

      const res = await fetch(`/api/escala/${selectedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        console.error("PATCH error:", json);
        toast.error(json?.error ?? "Falha ao salvar");
        return;
      }

      toast.success("Escala atualizada.");
      await fetchEscalaOnly();
      closeModal();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }, [
    selectedItem,
    nomeResponsavelRaw,
    envioAutomatico,
    enviarEmLocal,
    mensagem,
    fetchEscalaOnly,
    closeModal,
    selectedMemberId,
  ]);

  const deleteSelected = useCallback(async () => {
    if (!selectedItem) return;

    const ok = window.confirm(
      "Excluir este item da escala?\n\nIsso remove o item do app. (Não apaga no Google Calendar automaticamente.)"
    );
    if (!ok) return;

    try {
      setDeleting(true);

      const res = await fetch(`/api/escala/${selectedItem.id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? "Falha ao excluir");
        console.error("DELETE error:", json);
        return;
      }

      toast.success("Item excluído.");
      await fetchEscalaOnly();
      closeModal();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao excluir");
    } finally {
      setDeleting(false);
    }
  }, [selectedItem, fetchEscalaOnly, closeModal]);

  // ✅ ENVIAR AGORA (por item)
  const sendNow = useCallback(
    async (it: EscalaItem) => {
      try {
        setSendingNowId(it.id);

        const res = await fetch(`/api/escala/${it.id}/enviar-agora`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json?.ok) {
          toast.error(json?.error ?? "Falha ao enviar agora");
          console.error("[enviar-agora] error:", json);
          return;
        }

        toast.success("Disparo enviado.");
        await fetchEscalaOnly();
      } catch (e) {
        console.error(e);
        toast.error("Falha ao enviar agora");
      } finally {
        setSendingNowId(null);
      }
    },
    [fetchEscalaOnly]
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Escala</h1>
          <p className="text-gray-600 mt-2">
            Agenda por data ({days} dias por padrão). Clique em um item para
            editar.
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
            {membersLoading
              ? "Carregando membros..."
              : `${members.length} membros`}
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
                <div
                  key={date}
                  className="border border-gray-100 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-semibold text-gray-900">
                        {toBRDateFromYYYYMMDD(date)}
                      </div>

                      {/* ✅ Aviso na “raiz” do dia */}
                      {list.some((it) => !it.membroId) && (
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                          há itens não vinculados
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-gray-500">
                      {list.length} item(ns)
                    </div>
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
                          <span className="font-semibold">
                            {it.nomeResponsavel}
                          </span>

                          {!it.membroId && (
                            <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                              não vinculado
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {it.enviarEm
                              ? new Date(it.enviarEm).toLocaleString("pt-BR")
                              : "sem horário"}
                          </div>

                          {/* ✅ Botão ENVIAR AGORA */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              sendNow(it);
                            }}
                            disabled={sendingNowId === it.id}
                            className={cn(
                              "h-8 px-2 rounded-lg border text-xs font-semibold flex items-center gap-1",
                              sendingNowId === it.id
                                ? "border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed"
                                : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                            )}
                            title="Disparar agora (manual)"
                          >
                            <Send className="w-4 h-4" />
                            {sendingNowId === it.id ? "Enviando..." : "Enviar agora"}
                          </button>

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
          <div
            className="absolute inset-0 bg-black/30"
            onClick={closeModal}
          />

          <div className="relative w-[min(780px,92vw)] max-h-[90vh] bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4 shrink-0">
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  Editar escala
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {tipoLabel[selectedItem.tipo] ?? selectedItem.tipo} —{" "}
                  {new Date(selectedItem.dataEvento).toLocaleDateString("pt-BR")}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* ✅ EXCLUIR */}
                <button
                  onClick={deleteSelected}
                  disabled={saving || deleting}
                  className={cn(
                    "p-2 rounded-lg border transition",
                    saving || deleting
                      ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                      : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  )}
                  title="Excluir este item"
                  aria-label="Excluir"
                >
                  <Trash2 className="w-5 h-5" />
                </button>

                {/* FECHAR */}
                <button
                  onClick={closeModal}
                  disabled={saving || deleting}
                  className={cn(
                    "p-2 rounded-lg transition",
                    saving || deleting
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-gray-100"
                  )}
                  aria-label="Fechar"
                  title="Fechar"
                >
                  <X className="w-5 h-5 text-gray-700" />
                </button>
              </div>
            </div>

            <div className="px-5 py-5 space-y-5 overflow-y-auto">
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
                      {m.nome}
                      {m.email ? ` (${m.email})` : ""}
                    </option>
                  ))}
                </select>

                {!selectedMemberId && (
                  <p className="text-xs font-semibold text-yellow-800 mt-2">
                    ⚠️ Este item está{" "}
                    <span className="underline">não vinculado</span> a um membro.
                  </p>
                )}
              </div>

              <div className="border border-gray-100 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-gray-600" />
                    Programação do disparo
                  </div>

                  <button
                    type="button"
                    onClick={() => setEnvioAutomatico((v) => !v)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border",
                      envioAutomatico
                        ? "border-green-200 bg-green-50"
                        : "border-gray-200 bg-gray-50"
                    )}
                  >
                    {envioAutomatico ? (
                      <ToggleRight className="w-5 h-5 text-green-600" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-gray-600" />
                    )}
                    <span className="text-sm font-medium text-gray-800">
                      {envioAutomatico
                        ? "Envio automático: ON"
                        : "Envio automático: OFF"}
                    </span>
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Disparar em (data/hora)
                  </label>
                  <input
                    type="datetime-local"
                    value={enviarEmLocal}
                    onChange={(e) => setEnviarEmLocal(e.target.value)}
                    className="w-full h-11 border border-gray-200 rounded-lg px-3 bg-white text-gray-900"
                  />
                </div>
              </div>

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
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
              <Button variant="secondary" onClick={closeModal} disabled={saving || deleting}>
                Cancelar
              </Button>
              <Button onClick={saveAll} loading={saving} disabled={deleting}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}