'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Search,
  UserPlus,
  Trash2,
  Filter,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Users,
  MessageCircle,
  MessageSquareText,
  PhoneCall,
} from 'lucide-react';
import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Select from '@/components/ui/select';
import Modal from '@/components/ui/modal';
import Checkbox from '@/components/ui/checkbox';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { formatDate, groupLabels, cn } from '@/lib/utils';

interface Member {
  _id: string;
  nome: string;
  email: string;
  telefone?: string;
  data_nascimento?: string;
  endereco?: string;
  grupos: {
    pastoral: boolean;
    devocional: boolean;
    visitantes: boolean;
    convite?: boolean; // ✅ NOVO
    membros_sumidos: boolean;
  };
  rede_relacionamento?: { _id: string; nome: string };
  data_cadastro: string;
  ativo: boolean;
}

const initialFormState = {
  nome: '',
  email: '',
  telefone: '',
  data_nascimento: '',
  endereco: '',
  grupos: {
    pastoral: false,
    devocional: false,
    visitantes: false,
    convite: false, // ✅ NOVO
    membros_sumidos: false,
  },
  rede_relacionamento: '',
  ativo: true,
};

// ✅ Formatação APENAS para exibição
function formatPhoneDisplay(phone?: string) {
  if (!phone) return '';

  // já vem do banco como +16478062087 (ideal)
  const raw = String(phone).trim();
  const digits = raw.replace(/\D/g, '');

  // NANP: +1XXXXXXXXXX (11 dígitos começando com 1)
  if (digits.length === 11 && digits.startsWith('1')) {
    const area = digits.slice(1, 4);
    const prefix = digits.slice(4, 7);
    const line = digits.slice(7, 11);
    return `+1 (${area}) ${prefix}-${line}`;
  }

  // NANP sem +1: XXXXXXXXXX (10 dígitos)
  if (digits.length === 10) {
    const area = digits.slice(0, 3);
    const prefix = digits.slice(3, 6);
    const line = digits.slice(6, 10);
    return `+1 (${area}) ${prefix}-${line}`;
  }

  // Brasil: +55DDDNXXXXXXXX (12~13 dígitos começando com 55)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) {
      return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
    return `+${digits}`;
  }

  // fallback: mostra como está
  return raw;
}

// ✅ Helpers de links
function onlyDigits(input: string) {
  return String(input ?? '').replace(/\D/g, '');
}

function getWhatsAppUrl(phone?: string) {
  if (!phone) return null;
  const digits = onlyDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

function getSmsUrl(phone?: string) {
  if (!phone) return null;
  const cleaned = String(phone).trim();
  if (!cleaned) return null;
  return `sms:${cleaned}`;
}

function getTelUrl(phone?: string) {
  if (!phone) return null;
  const cleaned = String(phone).trim();
  if (!cleaned) return null;
  return `tel:${cleaned}`;
}

export default function MembrosPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [grupoFilter, setGrupoFilter] = useState('todos');
  const [ativoFilter, setAtivoFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const [formData, setFormData] = useState(initialFormState);
  const [saving, setSaving] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (grupoFilter !== 'todos') params.append('grupo', grupoFilter);
      if (ativoFilter) params.append('ativo', ativoFilter);

      const response = await fetch(`/api/members?${params.toString()}`);
      const data = await response?.json();
      if (data?.success) {
        setMembers(data?.data ?? []);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
      toast.error('Erro ao carregar membros');
    } finally {
      setLoading(false);
    }
  }, [search, grupoFilter, ativoFilter]);

  const fetchAllMembers = useCallback(async () => {
    try {
      const response = await fetch('/api/members');
      const data = await response?.json();
      if (data?.success) {
        setAllMembers(data?.data ?? []);
      }
    } catch (error) {
      console.error('Error fetching all members:', error);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
    fetchAllMembers();
  }, [fetchMembers, fetchAllMembers]);

  const openCreateModal = () => {
    setEditingMember(null);
    setFormData(initialFormState);
    setModalOpen(true);
  };

  const openEditModal = (member: Member) => {
    setEditingMember(member);
    setFormData({
      nome: member?.nome ?? '',
      email: member?.email ?? '',
      telefone: member?.telefone ?? '',
      data_nascimento: member?.data_nascimento
        ? new Date(member.data_nascimento)?.toISOString()?.split('T')?.[0] ?? ''
        : '',
      endereco: member?.endereco ?? '',
      grupos: {
        pastoral: member?.grupos?.pastoral ?? false,
        devocional: member?.grupos?.devocional ?? false,
        visitantes: member?.grupos?.visitantes ?? false,
        convite: member?.grupos?.convite ?? false, // ✅ NOVO
        membros_sumidos: member?.grupos?.membros_sumidos ?? false,
      },
      rede_relacionamento: (member?.rede_relacionamento as any)?._id ?? '',
      ativo: member?.ativo ?? true,
    });
    setModalOpen(true);
  };

  const openDeleteModal = (member: Member) => {
    setDeletingMember(member);
    setDeleteModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setSaving(true);

    try {
      const url = editingMember ? `/api/members/${editingMember._id}` : '/api/members';
      const method = editingMember ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response?.json();

      if (data?.success) {
        toast.success(editingMember ? 'Membro atualizado!' : 'Membro cadastrado!');
        setModalOpen(false);
        fetchMembers();
        fetchAllMembers();
      } else {
        toast.error(data?.error ?? 'Erro ao salvar membro');
      }
    } catch (error) {
      console.error('Error saving member:', error);
      toast.error('Erro ao salvar membro');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingMember) return;
    setSaving(true);

    try {
      const response = await fetch(`/api/members/${deletingMember._id}`, {
        method: 'DELETE',
      });

      const data = await response?.json();

      if (data?.success) {
        toast.success('Membro excluído!');
        setDeleteModalOpen(false);
        setDeletingMember(null);
        fetchMembers();
        fetchAllMembers();
      } else {
        toast.error(data?.error ?? 'Erro ao excluir membro');
      }
    } catch (error) {
      console.error('Error deleting member:', error);
      toast.error('Erro ao excluir membro');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingPage />;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestão de Membros</h1>
          <p className="text-gray-600 mt-1">Cadastre e gerencie os membros da comunidade</p>
        </div>
        <Button onClick={openCreateModal}>
          <UserPlus className="w-4 h-4" />
          Novo Membro
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl p-4 shadow-lg"
      >
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Buscar por nome ou email..."
              icon={Search}
              value={search}
              onChange={(e) => setSearch(e?.target?.value ?? '')}
            />
          </div>
          <div className="flex gap-4">
            <Select
              options={[
                { value: 'todos', label: 'Todos os Grupos' },
                { value: 'pastoral', label: 'Pastoral' },
                { value: 'devocional', label: 'Devocional' },
                { value: 'visitantes', label: 'Visitantes' },
                { value: 'convite', label: 'Convite' }, // ✅ NOVO
                { value: 'membros_sumidos', label: 'Membros Sumidos' },
              ]}
              value={grupoFilter}
              onChange={(e) => setGrupoFilter(e?.target?.value ?? 'todos')}
            />
            <Select
              options={[
                { value: '', label: 'Todos' },
                { value: 'true', label: 'Ativos' },
                { value: 'false', label: 'Inativos' },
              ]}
              value={ativoFilter}
              onChange={(e) => setAtivoFilter(e?.target?.value ?? '')}
            />
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <AnimatePresence mode="popLayout">
          {(members ?? [])?.map((member, index) => {
            const whatsappUrl = getWhatsAppUrl(member?.telefone);
            const smsUrl = getSmsUrl(member?.telefone);
            const telUrl = getTelUrl(member?.telefone);

            return (
              <motion.div
                key={member?._id ?? index}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => openEditModal(member)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') openEditModal(member);
                }}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{member?.nome ?? 'Membro'}</h3>
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full',
                        member?.ativo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      )}
                    >
                      {member?.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>

                  <div className="flex gap-1">
                    {member?.telefone && whatsappUrl && (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-700 transition-colors"
                        aria-label="WhatsApp"
                        title="WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>
                    )}

                    {member?.telefone && smsUrl && (
                      <a
                        href={smsUrl}
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 rounded-lg hover:bg-sky-50 text-sky-700 transition-colors"
                        aria-label="SMS"
                        title="SMS"
                      >
                        <MessageSquareText className="w-4 h-4" />
                      </a>
                    )}

                    {member?.telefone && telUrl && (
                      <a
                        href={telUrl}
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 rounded-lg hover:bg-violet-50 text-violet-700 transition-colors"
                        aria-label="Ligar"
                        title="Ligar"
                      >
                        <PhoneCall className="w-4 h-4" />
                      </a>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteModal(member);
                      }}
                      className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                      aria-label="Excluir"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{member?.email ?? '-'}</span>
                  </div>

                  {member?.telefone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span>{formatPhoneDisplay(member.telefone)}</span>
                    </div>
                  )}

                  {member?.data_nascimento && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span>{formatDate(member.data_nascimento)}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex flex-wrap gap-1">
                    {member?.grupos?.pastoral && (
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">Pastoral</span>
                    )}
                    {member?.grupos?.devocional && (
                      <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">Devocional</span>
                    )}
                    {member?.grupos?.visitantes && (
                      <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">Visitante</span>
                    )}
                    {member?.grupos?.convite && (
                      <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full">Convite</span>
                    )}
                    {member?.grupos?.membros_sumidos && (
                      <span className="text-xs px-2 py-1 bg-rose-100 text-rose-700 rounded-full">Sumido</span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {(members?.length ?? 0) === 0 && (
        <div className="text-center py-12">
          <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">Nenhum membro encontrado</p>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingMember ? 'Editar Membro' : 'Novo Membro'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nome *"
              value={formData?.nome ?? ''}
              onChange={(e) => setFormData({ ...formData, nome: e?.target?.value ?? '' })}
              required
            />
            <Input
              label="Email *"
              type="email"
              value={formData?.email ?? ''}
              onChange={(e) => setFormData({ ...formData, email: e?.target?.value ?? '' })}
              required
            />
            <Input
              label="Telefone"
              value={formData?.telefone ?? ''}
              onChange={(e) => setFormData({ ...formData, telefone: e?.target?.value ?? '' })}
            />
            <Input
              label="Data de Nascimento"
              type="date"
              value={formData?.data_nascimento ?? ''}
              onChange={(e) => setFormData({ ...formData, data_nascimento: e?.target?.value ?? '' })}
            />
          </div>

          <Input
            label="Endereço"
            value={formData?.endereco ?? ''}
            onChange={(e) => setFormData({ ...formData, endereco: e?.target?.value ?? '' })}
            icon={MapPin}
          />

          <Select
            label="Rede de Relacionamento"
            options={(allMembers ?? [])
              ?.filter((m) => m?._id !== editingMember?._id)
              ?.map((m) => ({ value: m?._id ?? '', label: m?.nome ?? '' }))}
            placeholder="Selecione um membro"
            value={formData?.rede_relacionamento ?? ''}
            onChange={(e) => setFormData({ ...formData, rede_relacionamento: e?.target?.value ?? '' })}
          />

          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Grupos</label>
            <div className="grid grid-cols-2 gap-3">
              <Checkbox
                label="Pastoral"
                checked={formData?.grupos?.pastoral ?? false}
                onChange={(checked) =>
                  setFormData({
                    ...formData,
                    grupos: { ...(formData?.grupos ?? {}), pastoral: checked },
                  })
                }
              />
              <Checkbox
                label="Devocional"
                checked={formData?.grupos?.devocional ?? false}
                onChange={(checked) =>
                  setFormData({
                    ...formData,
                    grupos: { ...(formData?.grupos ?? {}), devocional: checked },
                  })
                }
              />
              <Checkbox
                label="Visitantes"
                checked={formData?.grupos?.visitantes ?? false}
                onChange={(checked) =>
                  setFormData({
                    ...formData,
                    grupos: { ...(formData?.grupos ?? {}), visitantes: checked },
                  })
                }
              />
              <Checkbox
                label="Convite"
                checked={(formData as any)?.grupos?.convite ?? false}
                onChange={(checked) =>
                  setFormData({
                    ...formData,
                    grupos: { ...(formData?.grupos ?? {}), convite: checked },
                  } as any)
                }
              />
              <Checkbox
                label="Membros Sumidos"
                checked={formData?.grupos?.membros_sumidos ?? false}
                onChange={(checked) =>
                  setFormData({
                    ...formData,
                    grupos: { ...(formData?.grupos ?? {}), membros_sumidos: checked },
                  })
                }
              />
            </div>
          </div>

          <Checkbox
            label="Membro Ativo"
            checked={formData?.ativo ?? true}
            onChange={(checked) => setFormData({ ...formData, ativo: checked })}
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {editingMember ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirmar Exclusão"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Tem certeza que deseja excluir o membro{' '}
            <strong>{deletingMember?.nome ?? 'este membro'}</strong>?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={saving}>
              Excluir
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}