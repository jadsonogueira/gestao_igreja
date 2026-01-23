'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { CalendarClock, Trash2, RefreshCw, Send, Clock, User } from 'lucide-react';
import Button from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EscalaStatus, EscalaTipo } from '@/lib/types';

type EscalaItem = {
  id: string;
  tipo: EscalaTipo;
  dataEvento: string;
  horario?: string | null;
  nomeResponsavel: string;
  mensagem?: string | null;
  envioAutomatico: boolean;
  enviarEm: string;
  status: EscalaStatus;
  dataEnvio?: string | null;
  createdAt: string;
};

const tipoOptions: Array<{ value: EscalaTipo; label: string }> = [
  { value: 'DIRIGENTE', label: 'Dirigente' },
  { value: 'LOUVOR', label: 'Louvor' },
  { value: 'LOUVOR_ESPECIAL', label: 'Louvor Especial' },
  { value: 'PREGACAO', label: 'Pregação' },
  { value: 'TESTEMUNHO', label: 'Testemunho' },
];

function toInputDate(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toInputDateTime(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR');
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const statusBadge: Record<EscalaStatus, string> = {
  PENDENTE: 'bg-amber-100 text-amber-800',
  ENVIANDO: 'bg-blue-100 text-blue-800',
  ENVIADO: 'bg-emerald-100 text-emerald-800',
  ERRO: 'bg-rose-100 text-rose-800',
};

export default function EscalaPage() {
  const now = useMemo(() => new Date(), []);

  const [items, setItems] = useState<EscalaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [processingOne, setProcessingOne] = useState(false);

  // form
  const [tipo, setTipo] = useState<EscalaTipo>('DIRIGENTE');
  const [dataEvento, setDataEvento] = useState<string>(toInputDate(now));
  const [horario, setHorario] = useState<string>('');
  const [nomeResponsavel, setNomeResponsavel] = useState<string>('');
  const [mensagem, setMensagem] = useState<string>('');
  const [envioAutomatico, setEnvioAutomatico] = useState<boolean>(true);
  const [enviarEm, setEnviarEm] = useState<string>(toInputDateTime(new Date(now.getTime() + 60 * 60 * 1000)));

  const fetchItems = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch('/api/escala?take=200');
      const json = await res.json();
      if (json?.success) {
        setItems(json?.data?.items ?? []);
      } else {
        toast.error(json?.error ?? 'Erro ao carregar escala');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar escala');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const onCreate = async () => {
    if (!nomeResponsavel.trim()) {
      toast.error('Informe o nome do responsável');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tipo,
        dataEvento: new Date(dataEvento).toISOString(),
        horario: horario.trim() ? horario.trim() : null,
        nomeResponsavel: nomeResponsavel.trim(),
        mensagem: mensagem.trim() ? mensagem.trim() : null,
        envioAutomatico,
        enviarEm: new Date(enviarEm).toISOString(),
      };

      const res = await fetch('/api/escala', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json?.success) {
        toast.success('Escala criada!');
        setNomeResponsavel('');
        setMensagem('');
        setHorario('');
        fetchItems();
      } else {
        toast.error(json?.error ?? 'Erro ao criar escala');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao criar escala');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/escala/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json?.success) {
        toast.success('Removido');
        fetchItems();
      } else {
        toast.error(json?.error ?? 'Erro ao remover');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao remover');
    } finally {
      setDeletingId(null);
    }
  };

  const processOne = async () => {
    setProcessingOne(true);
    try {
      const res = await fetch('/api/emails/process', { method: 'POST' });
      const json = await res.json();
      if (json?.success) {
        const processed = json?.data?.processed ?? 0;
        if (processed === 0) {
          toast('Nada pendente para enviar agora');
        } else {
          toast.success('Processado 1 item (1/min)');
        }
        fetchItems();
      } else {
        toast.error(json?.error ?? 'Erro ao processar fila');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao processar fila');
    } finally {
      setProcessingOne(false);
    }
  };

  const tipoLabel = (t: EscalaTipo) => tipoOptions.find((x) => x.value === t)?.label ?? t;

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
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Escala</h1>
          <p className="text-gray-600 mt-1">
            Dirigente, Louvor, Louvor Especial, Pregação e Testemunho (com envio automático)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={fetchItems} loading={refreshing}>
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            Atualizar
          </Button>
          <Button variant="primary" onClick={processOne} loading={processingOne}>
            <Send className="w-4 h-4" />
            Processar 1 agora
          </Button>
        </div>
      </motion.div>

      {/* Form */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarClock className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Nova escala</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as EscalaTipo)}
            >
              {tipoOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data do evento</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={dataEvento}
              onChange={(e) => setDataEvento(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Horário (opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: 18h"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Responsável</label>
            <div className="relative">
              <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={nomeResponsavel}
                onChange={(e) => setNomeResponsavel(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Enviar automaticamente?
            </label>
            <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg">
              <input
                type="checkbox"
                checked={envioAutomatico}
                onChange={(e) => setEnvioAutomatico(e.target.checked)}
              />
              <span className="text-sm text-gray-700">Ativar envio automático</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Enviar em</label>
            <div className="relative">
              <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="datetime-local"
                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={enviarEm}
                onChange={(e) => setEnviarEm(e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              O scheduler vai disparar 1 por minuto quando esse horário chegar.
            </p>
          </div>

          <div className="md:col-span-2 xl:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mensagem informativa (opcional)
            </label>
            <textarea
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end">
          <Button onClick={onCreate} loading={saving}>
            Criar
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Itens cadastrados</h2>
          <p className="text-sm text-gray-600 mt-1">
            O envio automático só ocorre quando <b>enviarEm</b> &le agora e status = <b>PENDENTE</b>.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-6 py-3">
                  Tipo
                </th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-6 py-3">
                  Evento
                </th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-6 py-3">
                  Responsável
                </th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-6 py-3">
                  Enviar em
                </th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-6 py-3">
                  Status
                </th>
                <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wider px-6 py-3">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <tr>
                  <td className="px-6 py-6 text-gray-600" colSpan={6}>
                    Nenhum item ainda.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{tipoLabel(it.tipo)}</div>
                      <div className="text-xs text-gray-500">auto: {it.envioAutomatico ? 'sim' : 'não'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-900">{fmtDate(it.dataEvento)}</div>
                      {it.horario ? <div className="text-xs text-gray-500">{it.horario}</div> : null}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-900">{it.nomeResponsavel}</div>
                      {it.mensagem ? <div className="text-xs text-gray-500 line-clamp-1">{it.mensagem}</div> : null}
                    </td>
                    <td className="px-6 py-4 text-gray-900">{fmtDateTime(it.enviarEm)}</td>
                    <td className="px-6 py-4">
                      <span className={cn('text-xs font-semibold px-2 py-1 rounded-full', statusBadge[it.status])}>
                        {it.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="danger" size="sm" loading={deletingId === it.id} onClick={() => onDelete(it.id)}>
                        <Trash2 className="w-4 h-4" />
                        Remover
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}