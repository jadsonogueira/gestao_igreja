'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  History,
  Filter,
  ChevronLeft,
  ChevronRight,
  Mail,
  User,
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import Select from '@/components/ui/select';
import Input from '@/components/ui/input';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { groupLabels, statusLabels, statusColors, formatDateTime, cn } from '@/lib/utils';

interface EmailLog {
  _id: string;
  grupo: string;
  membro_id: {
    _id: string;
    nome: string;
    email: string;
  };
  membro_nome?: string;
  membro_email?: string;
  data_envio?: string;
  data_agendamento: string;
  status: string;
  mensagem_enviada?: string;
  erro_mensagem?: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const statusIcons: Record<string, any> = {
  pendente: Clock,
  enviando: Loader2,
  enviado: CheckCircle,
  erro: AlertCircle,
};

export default function HistoricoPage() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });
  const [filters, setFilters] = useState({
    grupo: 'todos',
    status: 'todos',
    dataInicio: '',
    dataFim: '',
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(pagination?.page ?? 1));
      params.append('limit', String(pagination?.limit ?? 20));

      if (filters?.grupo && filters.grupo !== 'todos') {
        params.append('grupo', filters.grupo);
      }
      if (filters?.status && filters.status !== 'todos') {
        params.append('status', filters.status);
      }
      if (filters?.dataInicio) {
        params.append('dataInicio', filters.dataInicio);
      }
      if (filters?.dataFim) {
        params.append('dataFim', filters.dataFim);
      }

      const response = await fetch(`/api/emails/logs?${params.toString()}`);
      const data = await response?.json();

      if (data?.success) {
        setLogs(data?.data ?? []);
        setPagination((prev) => ({
          ...prev,
          total: data?.pagination?.total ?? 0,
          pages: data?.pagination?.pages ?? 0,
        }));
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= (pagination?.pages ?? 1)) {
      setPagination((prev) => ({ ...prev, page }));
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold text-gray-900">Histórico de Envios</h1>
        <p className="text-gray-600 mt-1">Acompanhe todos os emails enviados pelo sistema</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl p-4 shadow-lg"
      >
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-400" />
          <span className="font-medium text-gray-700">Filtros</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Select
            label="Grupo"
            options={[
              { value: 'todos', label: 'Todos os Grupos' },
              { value: 'aniversario', label: 'Aniversário' },
              { value: 'pastoral', label: 'Pastoral' },
              { value: 'devocional', label: 'Devocional' },
              { value: 'visitantes', label: 'Visitantes' },
              { value: 'membros_sumidos', label: 'Membros Sumidos' },
            ]}
            value={filters?.grupo ?? 'todos'}
            onChange={(e) => handleFilterChange('grupo', e?.target?.value ?? 'todos')}
          />
          <Select
            label="Status"
            options={[
              { value: 'todos', label: 'Todos os Status' },
              { value: 'pendente', label: 'Pendente' },
              { value: 'enviando', label: 'Enviando' },
              { value: 'enviado', label: 'Enviado' },
              { value: 'erro', label: 'Erro' },
            ]}
            value={filters?.status ?? 'todos'}
            onChange={(e) => handleFilterChange('status', e?.target?.value ?? 'todos')}
          />
          <Input
            label="Data Início"
            type="date"
            value={filters?.dataInicio ?? ''}
            onChange={(e) => handleFilterChange('dataInicio', e?.target?.value ?? '')}
          />
          <Input
            label="Data Fim"
            type="date"
            value={filters?.dataFim ?? ''}
            onChange={(e) => handleFilterChange('dataFim', e?.target?.value ?? '')}
          />
        </div>
      </motion.div>

      {loading ? (
        <LoadingPage />
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl shadow-lg overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Membro
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Grupo
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Data Agendamento
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Data Envio
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(logs ?? [])?.length > 0 ? (
                  (logs ?? [])?.map((log, index) => {
                    const StatusIcon = statusIcons[log?.status ?? 'pendente'] ?? Clock;
                    const memberName = log?.membro_id?.nome ?? log?.membro_nome ?? 'Membro';
                    const memberEmail = log?.membro_id?.email ?? log?.membro_email ?? '-';

                    return (
                      <motion.tr
                        key={log?._id ?? index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                              <User className="w-5 h-5 text-gray-400" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{memberName}</p>
                              <p className="text-sm text-gray-500">{memberEmail}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                            {groupLabels[log?.grupo ?? ''] ?? log?.grupo ?? '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4" />
                            {formatDateTime(log?.data_agendamento)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Mail className="w-4 h-4" />
                            {log?.data_envio ? formatDateTime(log.data_envio) : '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium',
                              statusColors[log?.status ?? 'pendente'] ?? 'bg-gray-100 text-gray-700'
                            )}
                          >
                            <StatusIcon
                              className={cn(
                                'w-4 h-4',
                                log?.status === 'enviando' && 'animate-spin'
                              )}
                            />
                            {statusLabels[log?.status ?? 'pendente'] ?? log?.status ?? 'Pendente'}
                          </span>
                          {log?.erro_mensagem && (
                            <p className="text-xs text-red-500 mt-1 max-w-xs truncate">
                              {log.erro_mensagem}
                            </p>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <History className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                      <p className="text-gray-500">Nenhum registro encontrado</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {(pagination?.pages ?? 0) > 1 && (
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Mostrando {((pagination?.page ?? 1) - 1) * (pagination?.limit ?? 20) + 1} a{' '}
                {Math.min((pagination?.page ?? 1) * (pagination?.limit ?? 20), pagination?.total ?? 0)} de{' '}
                {pagination?.total ?? 0} registros
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage((pagination?.page ?? 1) - 1)}
                  disabled={(pagination?.page ?? 1) <= 1}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <span className="px-4 py-2 text-sm font-medium text-gray-700">
                  {pagination?.page ?? 1} / {pagination?.pages ?? 1}
                </span>
                <button
                  onClick={() => goToPage((pagination?.page ?? 1) + 1)}
                  disabled={(pagination?.page ?? 1) >= (pagination?.pages ?? 1)}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Próxima página"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
