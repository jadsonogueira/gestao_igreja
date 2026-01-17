'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, Save, Image as ImageIcon, MessageSquare, Settings, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'react-hot-toast';

import Button from '@/components/ui/button';

interface MessageGroup {
  _id: string;
  nome_grupo: string;
  mensagem_padrao?: string;
  frequencia_envio?: string;
  dia_semana?: number;
  dia_mes?: number;
  hora_envio?: number;
  minuto_envio?: number;
  flyer_url?: string;
}

interface GroupFormData {
  mensagem_padrao: string;
  frequencia_envio: string;
  dia_semana: number;
  dia_mes: number;
  hora_envio: number;
  minuto_envio: number;
  flyer_url: string;
}

export default function GruposPage() {
  const [groups, setGroups] = useState<MessageGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<MessageGroup | null>(null);
  const [formData, setFormData] = useState<GroupFormData>({
    mensagem_padrao: '',
    frequencia_envio: 'mensal',
    dia_semana: 1,
    dia_mes: 1,
    hora_envio: 9,
    minuto_envio: 0,
    flyer_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/groups');
      const payload = await response.json();

      if (!payload?.success) {
        toast.error(payload?.error ?? 'Erro ao carregar grupos');
        setGroups([]);
        setSelectedGroup(null);
        return;
      }

      // ✅ Backend retorna { success: true, data: [...] }
      // Mantive fallback para { groups: [...] } por segurança.
      const list: MessageGroup[] = payload?.data ?? payload?.groups ?? [];

      setGroups(list);

      // Se não tem grupo selecionado, seleciona o primeiro automaticamente
      if (!selectedGroup && list.length > 0) {
        const g = list[0];
        setSelectedGroup(g);
        setFormData({
          mensagem_padrao: g?.mensagem_padrao ?? '',
          frequencia_envio: g?.nome_grupo === 'aniversario' ? 'aniversario' : (g?.frequencia_envio ?? 'mensal'),
          dia_semana: g?.dia_semana ?? 1,
          dia_mes: g?.dia_mes ?? 1,
          hora_envio: g?.hora_envio ?? 9,
          minuto_envio: g?.minuto_envio ?? 0,
          flyer_url: g?.flyer_url ?? '',
        });
      }

      // Se lista ficou vazia e havia um selecionado, limpa
      if (list.length === 0) {
        setSelectedGroup(null);
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar grupos');
      setGroups([]);
      setSelectedGroup(null);
    } finally {
      setLoading(false);
    }
  }, [selectedGroup]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const selectGroup = (group: MessageGroup) => {
    setSelectedGroup(group);
    setFormData({
      mensagem_padrao: group?.mensagem_padrao ?? '',
      frequencia_envio: group?.nome_grupo === 'aniversario' ? 'aniversario' : (group?.frequencia_envio ?? 'mensal'),
      dia_semana: group?.dia_semana ?? 1,
      dia_mes: group?.dia_mes ?? 1,
      hora_envio: group?.hora_envio ?? 9,
      minuto_envio: group?.minuto_envio ?? 0,
      flyer_url: group?.flyer_url ?? '',
    });
  };

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

      const presignedData = await presignedResponse.json();

      if (!presignedData?.success) {
        throw new Error(presignedData?.error ?? 'Erro ao obter URL de upload');
      }

      const uploadResponse = await fetch(presignedData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file?.type ?? 'image/jpeg' },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Erro ao fazer upload do arquivo');
      }

      const urlResponse = await fetch(
        `/api/upload?path=${encodeURIComponent(presignedData.cloud_storage_path)}&isPublic=true`
      );
      const urlData = await urlResponse.json();

      if (urlData?.success) {
        setFormData((prev) => ({ ...prev, flyer_url: urlData.url ?? '' }));
        toast.success('Flyer enviado com sucesso!');
      } else {
        throw new Error(urlData?.error ?? 'Erro ao obter URL pública');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Erro ao fazer upload do flyer');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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

      const data = await response.json();

      if (data?.success) {
        toast.success('Configurações salvas!');
        fetchGroups();
      } else {
        toast.error(data?.error ?? 'Erro ao salvar');
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const frequencyOptions = useMemo(() => {
    const base = [
      { value: 'mensal', label: 'Mensal' },
      { value: 'semanal', label: 'Semanal' },
      // ✅ Backend usa "diaria"
      { value: 'diaria', label: 'Diária' },
    ];

    if (selectedGroup?.nome_grupo === 'aniversario') {
      return [{ value: 'aniversario', label: 'Aniversário (automático)' }];
    }

    return base;
  }, [selectedGroup]);

  const getFrequencyDescription = () => {
    if (!selectedGroup) return '';
    const freq = formData.frequencia_envio;

    if (selectedGroup.nome_grupo === 'aniversario') {
      return `Envio automático às ${String(formData.hora_envio).padStart(2, '0')}:${String(formData.minuto_envio).padStart(
        2,
        '0'
      )} na data do aniversário de cada membro`;
    }

    if (freq === 'diaria' || freq === 'diario') {
      return `Todos os dias às ${String(formData.hora_envio).padStart(2, '0')}:${String(formData.minuto_envio).padStart(2, '0')}`;
    }

    if (freq === 'semanal') {
      const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      return `Toda ${days[formData.dia_semana]} às ${String(formData.hora_envio).padStart(2, '0')}:${String(formData.minuto_envio).padStart(
        2,
        '0'
      )}`;
    }

    return `Todo dia ${formData.dia_mes} às ${String(formData.hora_envio).padStart(2, '0')}:${String(formData.minuto_envio).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-2 text-gray-600">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Carregando grupos...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Grupos</h1>
            <p className="text-gray-600 mt-1">Configure mensagens, flyers e frequência de envio para cada grupo</p>
          </div>
          <Button variant="secondary" onClick={fetchGroups}>
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
          >
            <div className="p-4 border-b border-gray-200 flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-600" />
              <h2 className="font-semibold text-gray-900">Lista de Grupos</h2>
            </div>

            <div className="divide-y divide-gray-200">
              {(groups ?? []).map((group) => (
                <button
                  key={group._id}
                  onClick={() => selectGroup(group)}
                  className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                    selectedGroup?._id === group._id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                >
                  <div className="font-medium text-gray-900">{group.nome_grupo}</div>
                  <div className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                    <MessageSquare className="w-4 h-4" />
                    {group.mensagem_padrao ? 'Mensagem configurada' : 'Sem mensagem'}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
          >
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-600" />
                <h2 className="font-semibold text-gray-900">Configurações</h2>
              </div>
              {selectedGroup && (
                <div className="text-sm text-gray-500">
                  Grupo selecionado: <span className="font-medium text-gray-700">{selectedGroup.nome_grupo}</span>
                </div>
              )}
            </div>

            {selectedGroup ? (
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mensagem Padrão</label>
                  <textarea
                    value={formData.mensagem_padrao}
                    onChange={(e) => setFormData((prev) => ({ ...prev, mensagem_padrao: e.target.value }))}
                    rows={5}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Digite a mensagem padrão para este grupo..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Frequência</label>
                    <select
                      value={formData.frequencia_envio}
                      onChange={(e) => setFormData((prev) => ({ ...prev, frequencia_envio: e.target.value }))}
                      disabled={selectedGroup.nome_grupo === 'aniversario'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100"
                    >
                      {frequencyOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Horário</label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={formData.hora_envio}
                          onChange={(e) => setFormData((prev) => ({ ...prev, hora_envio: Number(e.target.value || 0) }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </div>
                      <span className="self-center text-gray-500">:</span>
                      <div className="flex-1">
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={formData.minuto_envio}
                          onChange={(e) => setFormData((prev) => ({ ...prev, minuto_envio: Number(e.target.value || 0) }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {(formData.frequencia_envio === 'semanal' || formData.frequencia_envio === 'mensal') &&
                  selectedGroup.nome_grupo !== 'aniversario' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {formData.frequencia_envio === 'semanal' ? (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Dia da Semana</label>
                          <select
                            value={formData.dia_semana}
                            onChange={(e) => setFormData((prev) => ({ ...prev, dia_semana: Number(e.target.value || 1) }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          >
                            <option value={0}>Domingo</option>
                            <option value={1}>Segunda</option>
                            <option value={2}>Terça</option>
                            <option value={3}>Quarta</option>
                            <option value={4}>Quinta</option>
                            <option value={5}>Sexta</option>
                            <option value={6}>Sábado</option>
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Dia do Mês</label>
                          <input
                            type="number"
                            min={1}
                            max={31}
                            value={formData.dia_mes}
                            onChange={(e) => setFormData((prev) => ({ ...prev, dia_mes: Number(e.target.value || 1) }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                        </div>
                      )}
                    </div>
                  )}

                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-sm text-blue-700 font-medium">📅 {getFrequencyDescription()}</p>
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">Flyer</label>
                  <div className="flex gap-4">
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />

                    <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click?.()} loading={uploading}>
                      <Upload className="w-4 h-4" />
                      {uploading ? 'Enviando...' : 'Enviar Flyer'}
                    </Button>

                    {formData.flyer_url && (
                      <Button type="button" variant="ghost" onClick={() => setFormData((prev) => ({ ...prev, flyer_url: '' }))}>
                        Remover
                      </Button>
                    )}
                  </div>

                  {formData.flyer_url ? (
                    <div className="relative aspect-video w-full max-w-md rounded-lg overflow-hidden bg-gray-100">
                      <Image src={formData.flyer_url} alt="Flyer preview" fill className="object-contain" />
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
    </div>
  );
}
