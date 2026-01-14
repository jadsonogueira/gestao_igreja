import mongoose, { Schema, Model, Document } from 'mongoose';
import type { GroupType } from './message-group';

export type EmailStatus = 'pendente' | 'enviando' | 'enviado' | 'erro';

export interface IEmailLog extends Document {
  _id: mongoose.Types.ObjectId;
  grupo: GroupType;
  membro_id: mongoose.Types.ObjectId;
  membro_nome?: string;
  membro_email?: string;
  data_envio?: Date;
  data_agendamento: Date;
  status: EmailStatus;
  mensagem_enviada?: string;
  erro_mensagem?: string;
}

const EmailLogSchema = new Schema<IEmailLog>(
  {
    grupo: {
      type: String,
      required: true,
      enum: ['aniversario', 'pastoral', 'devocional', 'visitantes', 'membros_sumidos'],
    },
    membro_id: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    membro_nome: { type: String },
    membro_email: { type: String },
    data_envio: { type: Date },
    data_agendamento: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['pendente', 'enviando', 'enviado', 'erro'],
      default: 'pendente',
    },
    mensagem_enviada: { type: String },
    erro_mensagem: { type: String },
  },
  { timestamps: true }
);

const EmailLog: Model<IEmailLog> =
  mongoose?.models?.EmailLog || mongoose.model<IEmailLog>('EmailLog', EmailLogSchema);

export default EmailLog;
