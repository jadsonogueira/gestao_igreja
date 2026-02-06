'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Search,
  UserPlus,
  Edit,
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

// ✅ Link do WhatsApp (só dígitos)
function getWhatsAppUrl(phone?: string) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

// ✅ SMS (mantém E.164 com +)
function getSmsUrl(phone?: string) {
  if (!phone) return null;
  const cleaned = String(phone).trim();
  if (!cleaned) return null;
  return `sms:${cleaned}`;
}

// ✅ Ligar (mantém E.164 com +)
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
      {/* ... todo o topo igual ... */}

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
                className="bg-white rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow"
              >
                {/* ... header igual ... */}

                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{member?.email ?? '-'}</span>
                  </div>

                  {member?.telefone && (
                    <div className="flex items-start gap-2">
                      <Phone className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="flex flex-col gap-2">
                        <span>{formatPhoneDisplay(member.telefone)}</span>

                        <div className="flex flex-wrap gap-3">
                          {whatsappUrl && (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-emerald-700 hover:text-emerald-800"
                              aria-label="Abrir WhatsApp"
                            >
                              <MessageCircle className="w-4 h-4" />
                              WhatsApp
                            </a>
                          )}

                          {smsUrl && (
                            <a
                              href={smsUrl}
                              className="inline-flex items-center gap-2 text-sm text-sky-700 hover:text-sky-800"
                              aria-label="Enviar SMS"
                            >
                              <MessageSquareText className="w-4 h-4" />
                              SMS
                            </a>
                          )}

                          {telUrl && (
                            <a
                              href={telUrl}
                              className="inline-flex items-center gap-2 text-sm text-violet-700 hover:text-violet-800"
                              aria-label="Ligar"
                            >
                              <PhoneCall className="w-4 h-4" />
                              Ligar
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ... resto igual ... */}
                </div>

                {/* ... footer grupos igual ... */}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {/* ... modais iguais ... */}
    </div>
  );
}
