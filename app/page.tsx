'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  UserCheck,
  Mail,
  Clock,
  Cake,
  Calendar,
  Phone,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import StatCard from '@/components/ui/stat-card';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { formatDate } from '@/lib/utils';

interface Stats {
  totalMembers: number;
  activeMembers: number;
  emailsToday: number;
  pendingEmails: number;
  membersByGroup: {
    aniversario: number;
    pastoral: number;
    devocional: number;
    visitantes: number;
    membros_sumidos: number;
  };
  proximosAniversariantes: Array<{
    _id: string;
    nome: string;
    data_nascimento: string;
  }>;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats');
        const data = await response?.json();
        if (data?.success) {
          setStats(data?.data ?? null);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) return <LoadingPage />;

  const pieData = [
    { name: 'Pastoral', value: stats?.membersByGroup?.pastoral ?? 0 },
    { name: 'Devocional', value: stats?.membersByGroup?.devocional ?? 0 },
    { name: 'Visitantes', value: stats?.membersByGroup?.visitantes ?? 0 },
    { name: 'Sumidos', value: stats?.membersByGroup?.membros_sumidos ?? 0 },
  ];

  const barData = [
    { grupo: 'Pastoral', membros: stats?.membersByGroup?.pastoral ?? 0 },
    { grupo: 'Devocional', membros: stats?.membersByGroup?.devocional ?? 0 },
    { grupo: 'Visitantes', membros: stats?.membersByGroup?.visitantes ?? 0 },
    { grupo: 'Sumidos', membros: stats?.membersByGroup?.membros_sumidos ?? 0 },
  ];

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
          Bem-vindo ao <span className="text-blue-600">Painel de Gestão</span>
        </h1>
        <p className="text-gray-600">Acompanhe as estatísticas e gerencie sua comunidade</p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total de Membros"
          value={stats?.totalMembers ?? 0}
          icon={Users}
          color="blue"
          delay={0}
        />
        <StatCard
          title="Membros Ativos"
          value={stats?.activeMembers ?? 0}
          icon={UserCheck}
          color="green"
          delay={0.1}
        />
        <StatCard
          title="Emails Enviados Hoje"
          value={stats?.emailsToday ?? 0}
          icon={Mail}
          color="purple"
          delay={0.2}
        />
        <StatCard
          title="Emails Pendentes"
          value={stats?.pendingEmails ?? 0}
          icon={Clock}
          color="yellow"
          delay={0.3}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-2xl p-6 shadow-lg"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Distribuição por Grupo</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, value }) => `${name ?? ''}: ${value ?? 0}`}
                >
                  {pieData?.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS?.length] ?? '#3b82f6'}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => value ?? 0} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-2xl p-6 shadow-lg"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Membros por Grupo</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="grupo"
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar
                  dataKey="membros"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-white rounded-2xl p-6 shadow-lg"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-rose-500 to-pink-500 rounded-lg flex items-center justify-center">
            <Cake className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Próximos Aniversários</h2>
        </div>

        {(stats?.proximosAniversariantes?.length ?? 0) > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats?.proximosAniversariantes?.map((member, index) => (
              <motion.div
                key={member?._id ?? index}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.7 + index * 0.1 }}
                className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                <h3 className="font-medium text-gray-900 mb-2">{member?.nome ?? 'Membro'}</h3>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <Calendar className="w-4 h-4" />
                  <span>{member?.data_nascimento ? formatDate(member.data_nascimento) : '-'}</span>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">Nenhum aniversário próximo</p>
        )}
      </motion.div>
    </div>
  );
}
