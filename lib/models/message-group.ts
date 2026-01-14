import mongoose, { Schema, Model, Document } from 'mongoose';

export type GroupType = 'aniversario' | 'pastoral' | 'devocional' | 'visitantes' | 'membros_sumidos';
export type FrequencyType = 'aniversario' | 'diaria' | 'semanal' | 'mensal';

export interface IMessageGroup extends Document {
  _id: mongoose.Types.ObjectId;
  nome_grupo: GroupType;
  mensagem_padrao: string;
  frequencia_envio: FrequencyType;
  dia_semana?: number; // 0-6 (Domingo-Sábado)
  dia_mes?: number; // 1-31
  hora_envio: number; // 0-23
  flyer_url?: string;
  ultimo_envio?: Date;
  proximo_envio?: Date;
  ativo: boolean;
}

const MessageGroupSchema = new Schema<IMessageGroup>(
  {
    nome_grupo: {
      type: String,
      required: true,
      enum: ['aniversario', 'pastoral', 'devocional', 'visitantes', 'membros_sumidos'],
      unique: true,
    },
    mensagem_padrao: { type: String, default: '' },
    frequencia_envio: {
      type: String,
      enum: ['aniversario', 'diaria', 'semanal', 'mensal'],
      default: 'mensal',
    },
    dia_semana: { type: Number, min: 0, max: 6 }, // 0=Domingo, 6=Sábado
    dia_mes: { type: Number, min: 1, max: 31 },
    hora_envio: { type: Number, min: 0, max: 23, default: 9 }, // Default 9h
    flyer_url: { type: String },
    ultimo_envio: { type: Date },
    proximo_envio: { type: Date },
    ativo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const MessageGroup: Model<IMessageGroup> =
  mongoose?.models?.MessageGroup || mongoose.model<IMessageGroup>('MessageGroup', MessageGroupSchema);

export default MessageGroup;
