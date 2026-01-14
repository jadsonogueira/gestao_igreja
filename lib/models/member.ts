import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IMember extends Document {
  _id: mongoose.Types.ObjectId;
  nome: string;
  email: string;
  telefone?: string;
  data_nascimento?: Date;
  endereco?: string;
  grupos: {
    pastoral: boolean;
    devocional: boolean;
    visitantes: boolean;
    membros_sumidos: boolean;
  };
  rede_relacionamento?: mongoose.Types.ObjectId;
  data_cadastro: Date;
  ativo: boolean;
}

const MemberSchema = new Schema<IMember>(
  {
    nome: { type: String, required: true },
    email: { type: String, required: true },
    telefone: { type: String },
    data_nascimento: { type: Date },
    endereco: { type: String },
    grupos: {
      pastoral: { type: Boolean, default: false },
      devocional: { type: Boolean, default: false },
      visitantes: { type: Boolean, default: false },
      membros_sumidos: { type: Boolean, default: false },
    },
    rede_relacionamento: { type: Schema.Types.ObjectId, ref: 'Member' },
    data_cadastro: { type: Date, default: Date.now },
    ativo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Member: Model<IMember> =
  mongoose?.models?.Member || mongoose.model<IMember>('Member', MemberSchema);

export default Member;
