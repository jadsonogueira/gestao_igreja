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

  // vínculo (vem do GET /api/escala)
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
      setRefreshing(false);
    }
  }, [fetchEscalaOnly, importFromGoogle]);

  const fetchMembers = useCallback(async () =>
