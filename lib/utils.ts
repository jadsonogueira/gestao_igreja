import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | undefined | null): string {
  if (!date) return '-';
  try {
    let d: Date;
    if (typeof date === 'string') {
      // Se já tem T (ISO format), usa direto; senão adiciona T00:00:00
      d = date.includes('T') ? new Date(date) : new Date(date + 'T00:00:00');
    } else {
      d = new Date(date);
    }
    
    // Verifica se a data é válida
    if (isNaN(d.getTime())) return '-';
    
    // Usa UTC para evitar problemas de fuso horário
    const day = d.getUTCDate().toString().padStart(2, '0');
    const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = d.getUTCFullYear();
    
    return `${day}/${month}/${year}`;
  } catch {
    return '-';
  }
}

export function formatDateTime(date: string | Date | undefined): string {
  if (!date) return '-';
  try {
    const d = new Date(date);
    return d?.toLocaleDateString?.('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) ?? '-';
  } catch {
    return '-';
  }
}

export const groupLabels: Record<string, string> = {
  aniversario: 'Aniversário',
  pastoral: 'Pastoral',
  devocional: 'Devocional',
  visitantes: 'Visitantes',
  membros_sumidos: 'Membros Sumidos',
};

export const frequencyLabels: Record<string, string> = {
  aniversario: 'Na data do aniversário',
  diaria: 'Diária',
  semanal: 'Semanal',
  mensal: 'Mensal',
};

export const diasSemanaLabels: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
};

export const statusLabels: Record<string, string> = {
  pendente: 'Pendente',
  enviando: 'Enviando',
  enviado: 'Enviado',
  erro: 'Erro',
};

export const statusColors: Record<string, string> = {
  pendente: 'bg-yellow-100 text-yellow-700',
  enviando: 'bg-blue-100 text-blue-700',
  enviado: 'bg-green-100 text-green-700',
  erro: 'bg-red-100 text-red-700',
};
