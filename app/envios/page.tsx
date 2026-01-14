'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Send,
  Users,
  Clock,
  Calendar,
  PlayCircle,
  Cake,
  BookOpen,
  UserX,
  Eye,
  RefreshCw,
  Power,
  PowerOff,
} from 'lucide-react';
import Button from '@/components/ui/button';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { groupLabels, frequencyLabels, formatDateTime, cn } from '@/lib/utils';

interface GroupWithCount {
  _id: string;
  nome_grupo: string;
  mensagem_padrao: string;
  frequencia_envio: string;
  flyer_url?: string;
  ultimo_envio?: string;
  proximo_envio?: string;
  ativo: boolean;
  memberCount: number;
}

const groupIcons: Record<string, any> = {
  aniversario: Cake,
  pastoral: Users,
  devocional: BookOpen,
  visitantes: Eye,
  membros_sumidos: UserX,
};

const groupColors: Record<string, string> = {
  aniversario: 'from-pink-500 to-rose-500',
  pastoral: 'from-blue-500 to-indigo-500',
  devocional: 'from-emerald-500 to-teal-500',
  visitantes: 'from-amber-500 to-orange-500',
  membros_sumidos: 'from-purple-500 to-violet-500',
};

export default function EnviosPage() {
  const [groups, setGroups] = useState<GroupWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingGroup, setSendingGroup] = useState<string | null>(null);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [togglingGroup, setTogglingGroup] = useState<string | null>(null);
  const processingInterval = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/stats');
      const data = await response?.json();
      if (data?.success) {
        setGroups(data?.data?.groups ?? []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleGroupAutomacao = async (groupId: string, currentStatus: boolean) => {
    setTogglingGroup(groupId);
    try {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !currentStatus }),
      });

      const data = await response?.json();

      if (data?.success) {
        toast.success(`Automação ${!currentStatus ? 'ativada' : 'desativada'} com sucesso`);
        fetchData();
      } else {
        toast.error(data?.error ?? 'Erro ao atualizar configuração');
      }
    } catch (error) {
      console.error('Error toggling group automation:', error);
      toast.error('Erro ao atualizar configuração');
    } finally {
      setTogglingGroup(null);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSendEmails = async (grupo: string) => {
    setSendingGroup(grupo);

    try {
      const response = await fetch('/api/emails/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grupo }),
      });

      const data = await response?.json();

      if (data?.success) {
        toast.success(data?.message ?? 'Emails agendados!');
        startProcessingQueue();
        fetchData();
      } else {
        toast.error(data?.error ?? 'Erro ao agendar emails');
      }
    } catch (error) {
      console.error('Error sending emails:', error);
      toast.error('Erro ao agendar emails');
    } finally {
      setSendingGroup(null);
    }
  };

  const startProcessingQueue = () => {
    if (processingInterval?.current) return;
    
    setProcessingQueue(true);
    
    const processOne = async () => {
      try {
        const response = await fetch('/api/emails/process', { method: 'POST' });
        const data = await response?.json();
        
        if (data?.processed === 0) {
          stopProcessingQueue();
          toast.success('Fila de emails processada!');
        }
      } catch (error) {
        console.error('Error processing queue:', error);
      }
    };

    processOne();
    processingInterval.current = setInterval(processOne, 60000);
  };

  const stopProcessingQueue = () => {
    if (processingInterval?.current) {
      clearInterval(processingInterval.current);
      processingInterval.current = null;
    }
    setProcessingQueue(false);
  };

  useEffect(() => {
    return () => {
      if (processingInterval?.current) {
        clearInterval(processingInterval.current);
      }
    };
  }, []);

  if (loading) return <LoadingPage />;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gerenciamento de Envios</h1>
          <p className="text-gray-600 mt-1">Envie emails para os grupos de membros</p>
        </div>
        <div className="flex items-center gap-3">
          {processingQueue && (
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">Processando fila (1 email/min)...</span>
            </div>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {(groups ?? [])?.map((group, index) => {
          const Icon = groupIcons[group?.nome_grupo ?? ''] ?? Send;

          return (
            <motion.div
              key={group?._id ?? index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
            >
              <div
                className={cn(
                  'p-6 bg-gradient-to-br text-white',
                  groupColors[group?.nome_grupo ?? ''] ?? 'from-gray-500 to-gray-600'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">
                        {groupLabels[group?.nome_grupo ?? ''] ?? group?.nome_grupo ?? 'Grupo'}
                      </h3>
                      <p className="text-xs text-white/80 mt-1">
                        {group?.ativo ? '🟢 Automação ativa' : '⚪ Automação pausada'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleGroupAutomacao(group?._id ?? '', group?.ativo ?? false)}
                    disabled={togglingGroup === group?._id}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                      "bg-white/20 hover:bg-white/30 backdrop-blur-sm",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {togglingGroup === group?._id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : group?.ativo ? (
                      <PowerOff className="w-4 h-4" />
                    ) : (
                      <Power className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{group?.memberCount ?? 0}</p>
                      <p className="text-xs text-gray-500">Membros</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {frequencyLabels[group?.frequencia_envio ?? 'mensal'] ?? 'Mensal'}
                      </p>
                      <p className="text-xs text-gray-500">Frequência</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-500">Último envio:</span>
                    <span className="font-medium text-gray-700">
                      {group?.ultimo_envio ? formatDateTime(group.ultimo_envio) : 'Nunca'}
                    </span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => handleSendEmails(group?.nome_grupo ?? '')}
                  loading={sendingGroup === group?.nome_grupo}
                  disabled={(group?.memberCount ?? 0) === 0}
                >
                  <PlayCircle className="w-4 h-4" />
                  Enviar Agora
                </Button>

                {(group?.memberCount ?? 0) === 0 && (
                  <p className="text-xs text-center text-gray-400">
                    Nenhum membro neste grupo
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-blue-50 rounded-2xl p-6"
      >
        <h3 className="font-semibold text-blue-900 mb-2">Como funciona o envio?</h3>
        <ul className="space-y-2 text-sm text-blue-700">
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
            Ao clicar em "Enviar Agora", os emails são adicionados à fila de envio.
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
            O sistema processa <strong>1 email por minuto</strong> para evitar bloqueios.
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
            Cada email inclui a mensagem padrão do grupo e o flyer configurado.
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
            Acompanhe o status dos envios na página de Histórico.
          </li>
        </ul>
      </motion.div>
    </div>
  );
}
