'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Image from 'next/image';
import {
  MessageSquare,
  Upload,
  Save,
  Image as ImageIcon,
  Cake,
  Users,
  BookOpen,
  UserX,
  Eye,
  Clock,
  Calendar,
} from 'lucide-react';
import Button from '@/components/ui/button';
import Select from '@/components/ui/select';
import Textarea from '@/components/ui/textarea';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { groupLabels, frequencyLabels, diasSemanaLabels, cn } from '@/lib/utils';

interface MessageGroup {
  _id: string;
  nome_grupo: string;
  mensagem_padrao: string;
  frequencia_envio: string;
  dia_semana?: number;
  dia_mes?: number;
  hora_envio: number;
  minuto_envio: number;
  flyer_url?: string; // ✅ vamos armazenar a CHAVE (cloud_storage_path)
  ultimo_envio?: string;
  proximo_envio?: string;
  ativo: boolean;
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

const horasOptions = Array.from({ length: 24 }, (_, i) => ({
  value: i.toString(),
  label: `${i.toString().padStart(2, '0')}h`,
}));

const minutosOptions = [
  { value: '0', label: '00 min' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
];

const diasMesOptions = Array.from({ length: 31 }, (_, i) => ({
  value: (i + 1).toString(),
  label: `Dia ${i + 1}`,
}));

const diasSemanaOptions = Object.entries(diasSemanaLabels).map(([value, label]) => ({
  value,
  label,
}));

function isHttpUrl(v?: string) {
  return !!v && (v.startsWith('http://') || v.startsWith('https://'));
}

export default function GruposPage() {
  const [groups, setGroups] = useState<MessageGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<MessageGroup | null>(null);
  const [formData, setFormData] = useState({
    mensagem_padrao: '',
    frequencia_envio: 'mensal',
    dia_semana: 1,
    dia_mes: 1,
    hora_envio: 9,
    minuto_envio: 0,
    flyer_url: '', // ✅ salva a CHAVE (cloud_storage_path)
  });

  // ✅ URL só para preview (assinada)
  const [flyerPreviewUrl, setFlyerPreviewUrl] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPreviewFromKey = useCallback(async (keyOrUrl: string) => {
    try {
      if (!keyOrUrl) {
        setFlyerPreviewUrl('');
        return;
      }

      // Se já for URL (casos antigos), usa direto
      if (isHttpUrl(keyOrUrl)) {
        setFlyerPreviewUrl(keyOrUrl);
        return;
      }

      // Se for chave, pega URL assinada para preview
      const res = await fetch(`/api/upload?path=${encodeURIComponent(keyOrUrl)}&mode=preview`);
      const data = await res.json();
      if (data?.success) setFlyerPreviewUrl(data.url);
      else setFlyerPreviewUrl('');
    } catch {
      setFlyerPreviewUrl('');
    }
  }, []);

  const selectGroup = useCallback(
    (group: MessageGroup) => {
      setSelectedGroup(group);

      const flyerKeyOrUrl = group?.flyer_url ?? '';

      setFormData({
        mensagem_padrao: group?.mensagem_padrao ?? '',
        frequencia_envio: group?.nome_grupo === 'aniversario' ? 'aniversario' : (group?.frequencia_envio ?? 'mensal'),
        dia_semana: group?.dia_semana ?? 1,
        dia_mes: group?.dia_mes ?? 1,
        hora_envio: group?.hora_envio ?? 9,
        minuto_envio: group?.minuto_envio ?? 0,
        flyer_url: flyerKeyOrUrl, // ✅ salva a chave (ou URL antiga)
      });

      loadPreviewFromKey(flyerKeyOrUrl);
    },
    [loadPreviewFromKey]
  );

  const fetchGroups = useCallback(async () => {
    try {
      const response = await fetch('/api/groups');
      const data = await response?.json();

      if (data?.success) {
        const list: MessageGroup[] = data?.data ?? [];
        setGroups(list);

        if (!selectedGroup && list.length > 0) {
          selectGroup(list[0]);
        }

        if (list.length === 0) {
          setSelectedGroup(null);
          setFlyerPreviewUrl('');
        }
      } else {
        toast.error(data?.error ?? 'Erro ao carregar grupos');
        setGroups([]);
        setSelectedGroup(null);
        setFlyerPreviewUrl('');
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
      toast.error('Erro ao carregar grupos');
      setGroups([]);
      setSelectedGroup(null);
      setFlyerPreviewUrl('');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup, selectGroup]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e?.target?.files?.[0];
    if (!file) return;

    if (!(file?.type ?? '').startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }

    setUploading(true);

    try {
      const presignedResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file?.name ?? 'flyer.jpg',
          contentType: file?.type ?? 'image/jpeg',
          isPublic: true,
        }),
      });

      const presignedData = await presignedResponse?.json();

      if (!presignedData?.success) {
        throw new Error('Erro ao obter URL de upload');
      }

      const uploadHeaders: Record<string, string> = {
        'Content-Type': file?.type ?? 'image/jpeg',
      };

      const uploadResponse = await fetch(presignedData?.uploadUrl, {
        method: 'PUT',
        headers: uploadHeaders,
        body: file,
      });

      if (!uploadResponse?.ok) {
        throw new Error('Erro ao fazer upload do arquivo');
      }

      // ✅ Agora guardamos a CHAVE no form (persistente)
      const key = presignedData?.cloud_storage_path ?? '';
      setFormData((prev) => ({ ...prev, flyer_url: key }));

      // ✅ E pegamos uma URL assinada só pra preview
      const urlResponse = await fetch(`/api/upload?path=${encodeURIComponent(key)}&mode=preview`);
      const urlData = await urlResponse?.json();

      if (urlData?.success) {
        setFlyerPreviewUrl(urlData?.url ?? '');
        toast.success('Flyer enviado com sucesso!');
      } else {
        setFlyerPreviewUrl('');
        toast.success('Flyer enviado (sem preview)');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Erro ao fazer upload do flyer');
    } finally {
      setUploading(false);
      if (fileInputRef?.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!selectedGroup) return;
    setSaving(true);

    try {
      const response = await fetch(`/api/groups/${selectedGroup._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response?.json();

      if (data?.success) {
        toast.success('Configurações salvas!');
        fetchGroups();
      } else {
        toast.error(data?.error ?? 'Erro ao salvar');
      }
    } catch (error) {
      console.error('Error saving group:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const getFrequencyDescription = () => {
    if (!selectedGroup) return '';

    const hora = formData.hora_envio.toString().padStart(2, '0');
    const minuto = formData.minuto_envio.toString().padStart(2, '0');
    const horario = `${hora}:${minuto}`;

    if (selectedGroup.nome_grupo === 'aniversario') {
      return `Envio automático às ${horario} na data do aniversário de cada membro`;
    }

    switch (formData.frequencia_envio) {
      case 'diaria':
        return `Envio todos os dias às ${horario}`;
      case 'semanal':
        return `Envio toda ${diasSemanaLabels[formData.dia_semana]} às ${horario}`;
      case 'mensal':
        return `Envio todo dia ${formData.dia_mes} às ${horario}`;
      default:
        return '';
    }
  };

  if (loading) return <LoadingPage />;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-gray-900">Configuração de Grupos</h1>
        <p className="text-gray-600 mt-1">Configure mensagens, flyers e frequência de envio para cada grupo</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-1 space-y-3"
        >
          {(groups ?? [])?.map((group, index) => {
            const Icon = groupIcons[group?.nome_grupo ?? ''] ?? MessageSquare;
            const isSelected = selectedGroup?._id === group?._id;

            return (
              <motion.button
                key={group?._id ?? index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
                onClick={() => selectGroup(group)}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200 text-left',
                  isSelected ? 'bg-white shadow-lg ring-2 ring-blue-500' : 'bg-white/50 hover:bg-white hover:shadow-md'
                )}
              >
                <div
                  className={cn(
                    'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center',
                    groupColors[group?.nome_grupo ?? ''] ?? 'from-gray-500 to-gray-600'
                  )}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">
                    {groupLabels[group?.nome_grupo ?? ''] ?? group?.nome_grupo ?? 'Grupo'}
                  </h3>
                  <p className="text-sm text-gray-500 truncate">
                    {group?.nome_grupo === 'aniversario'
                      ? 'Na data do aniversário'
                      : frequencyLabels[group?.frequencia_envio ?? 'mensal'] ?? 'Mensal'}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-lg"
        >
          {selectedGroup ? (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    'w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center',
                    groupColors[selectedGroup?.nome_grupo ?? ''] ?? 'from-gray-500 to-gray-600'
                  )}
                >
                  {(() => {
                    const Icon = groupIcons[selectedGroup?.nome_grupo ?? ''] ?? MessageSquare;
                    return <Icon className="w-7 h-7 text-white" />;
                  })()}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {groupLabels[selectedGroup?.nome_grupo ?? ''] ?? selectedGroup?.nome_grupo ?? 'Grupo'}
                  </h2>
                  <p className="text-gray-500">
                    {selectedGroup?.nome_grupo === 'aniversario'
                      ? 'Envio automático para aniversariantes do dia'
                      : 'Membros marcados manualmente'}
                  </p>
                </div>
              </div>

              <Textarea
                label="Mensagem Padrão"
                value={formData?.mensagem_padrao ?? ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, mensagem_padrao: e?.target?.value ?? '' }))}
                placeholder="Digite a mensagem que será enviada aos membros..."
                rows={6}
              />

              <div className="space-y-4 p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 text-gray-700 font-medium">
                  <Clock className="w-5 h-5" />
                  <span>Configuração de Frequência</span>
                </div>

                {selectedGroup?.nome_grupo === 'aniversario' ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      O envio será feito automaticamente na data de aniversário de cada membro
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <Select
                        label="Hora"
                        options={horasOptions}
                        value={formData.hora_envio.toString()}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, hora_envio: parseInt(e?.target?.value ?? '9') }))
                        }
                      />
                      <Select
                        label="Minuto"
                        options={minutosOptions}
                        value={formData.minuto_envio.toString()}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, minuto_envio: parseInt(e?.target?.value ?? '0') }))
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Select
                      label="Frequência de Envio"
                      options={[
                        { value: 'diaria', label: 'Diária' },
                        { value: 'semanal', label: 'Semanal' },
                        { value: 'mensal', label: 'Mensal' },
                      ]}
                      value={formData?.frequencia_envio ?? 'mensal'}
                      onChange={(e) => setFormData((prev) => ({ ...prev, frequencia_envio: e?.target?.value ?? 'mensal' }))}
                    />

                    {formData.frequencia_envio === 'semanal' && (
                      <Select
                        label="Dia da Semana"
                        options={diasSemanaOptions}
                        value={formData.dia_semana.toString()}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, dia_semana: parseInt(e?.target?.value ?? '1') }))
                        }
                      />
                    )}

                    {formData.frequencia_envio === 'mensal' && (
                      <Select
                        label="Dia do Mês"
                        options={diasMesOptions}
                        value={formData.dia_mes.toString()}
                        onChange={(e) => setFormData((prev) => ({ ...prev, dia_mes: parseInt(e?.target?.value ?? '1') }))}
                      />
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <Select
                        label="Hora"
                        options={horasOptions}
                        value={formData.hora_envio.toString()}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, hora_envio: parseInt(e?.target?.value ?? '9') }))
                        }
                      />
                      <Select
                        label="Minuto"
                        options={minutosOptions}
                        value={formData.minuto_envio.toString()}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, minuto_envio: parseInt(e?.target?.value ?? '0') }))
                        }
                      />
                    </div>
                  </div>
                )}

                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-sm text-blue-700 font-medium">📅 {getFrequencyDescription()}</p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Flyer</label>

                <div className="flex gap-4">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />

                  <Button type="button" variant="secondary" onClick={() => fileInputRef?.current?.click?.()} loading={uploading}>
                    <Upload className="w-4 h-4" />
                    {uploading ? 'Enviando...' : 'Enviar Flyer'}
                  </Button>

                  {(formData?.flyer_url || flyerPreviewUrl) && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, flyer_url: '' }));
                        setFlyerPreviewUrl('');
                      }}
                    >
                      Remover
                    </Button>
                  )}
                </div>

                {flyerPreviewUrl ? (
                  <div className="relative aspect-video w-full max-w-md rounded-lg overflow-hidden bg-gray-100">
                    <Image src={flyerPreviewUrl} alt="Flyer preview" fill className="object-contain" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-full max-w-md h-48 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300">
                    <div className="text-center text-gray-400">
                      <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                      <p>Nenhum flyer selecionado</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-200">
                <Button onClick={handleSave} loading={saving}>
                  <Save className="w-4 h-4" />
                  Salvar Configurações
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <p>Selecione um grupo para configurar</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
