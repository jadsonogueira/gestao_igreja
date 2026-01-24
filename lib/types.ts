export type GroupType =
  | 'aniversario'
  | 'pastoral'
  | 'devocional'
  | 'visitantes'
  | 'membros_sumidos';

export type FrequencyType = 'aniversario' | 'diaria' | 'semanal' | 'mensal';
export type EmailStatus = 'pendente' | 'enviando' | 'enviado' | 'erro';

// =========================
// ESCALA
// =========================
// ✅ mantenha em sincronia com o enum EscalaTipo do schema.prisma
export type EscalaTipo =
  | 'DIRIGENTE'
  | 'LOUVOR'
  | 'LOUVOR_ESPECIAL'
  | 'PREGACAO'
  | 'TESTEMUNHO'
  | 'APOIO';

export type EscalaStatus = 'PENDENTE' | 'ENVIANDO' | 'ENVIADO' | 'ERRO';
