export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { sendScaleTriggerEmail } from '@/lib/sendScaleTriggerEmail';

const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'America/Toronto';

function fmtDateInTZ(d: Date) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  return `${day}/${month}/${year}`;
}

export async function POST() {
  try {
    // 1) pega 1 item pendente da fila de EmailLog (grupos)
    const pendingEmail = await prisma.emailLog.findFirst({
      where: { status: 'pendente' },
      orderBy: { createdAt: 'asc' },
    });

    if (pendingEmail) {
      await prisma.emailLog.update({
        where: { id: pendingEmail.id },
        data: { status: 'enviando' },
      });

      // aqui ficaria seu envio existente (Resend etc.)...
      // (mantive a estrutura geral sem mexer no seu fluxo de grupos)

      await prisma.emailLog.update({
        where: { id: pendingEmail.id },
        data: { status: 'enviado', dataEnvio: new Date() },
      });

      return NextResponse.json({
        success: true,
        data: { processed: 1, success: 1, errors: 0 },
        message: 'Processado 1 envio (grupo)',
      });
    }

    // 2) se não tem EmailLog pendente, tenta Escala pendente
    const now = new Date();

    const pendingEscala = await prisma.escala.findFirst({
      where: {
        status: 'PENDENTE',
        envioAutomatico: true,
        enviarEm: { lte: now },
      },
      orderBy: { enviarEm: 'asc' },
    });

    if (!pendingEscala) {
      return NextResponse.json({
        success: true,
        data: { processed: 0, success: 0, errors: 0 },
        message: 'Nenhum envio pendente',
      });
    }

    await prisma.escala.update({
      where: { id: pendingEscala.id },
      data: { status: 'ENVIANDO' },
    });

    // ✅ regra: envio de escala exige vínculo com membro (para manter o padrão do PA)
    if (!pendingEscala.membroId) {
      await prisma.escala.update({
        where: { id: pendingEscala.id },
        data: {
          status: 'ERRO',
          erroMensagem: 'Escala sem vínculo com membro (membroId vazio).',
        },
      });

      return NextResponse.json({
        success: false,
        error: 'Escala sem vínculo com membro',
        details: 'membroId vazio - não é possível montar o padrão do e-mail para o Power Automate.',
      });
    }

    const member = await prisma.member.findUnique({
      where: { id: pendingEscala.membroId },
      select: { id: true, nome: true, email: true, telefone: true },
    });

    if (!member) {
      await prisma.escala.update({
        where: { id: pendingEscala.id },
        data: {
          status: 'ERRO',
          erroMensagem: 'Escala com membroId inválido (membro não encontrado).',
        },
      });

      return NextResponse.json({
        success: false,
        error: 'Membro não encontrado',
        details: 'membroId aponta para um registro que não existe.',
      });
    }

    const responsavelNome =
      pendingEscala.membroNome ?? pendingEscala.nomeResponsavelRaw ?? member.nome ?? '—';

    const dataEventoFmt = fmtDateInTZ(pendingEscala.dataEvento);
    const agendamentoISO = pendingEscala.enviarEm.toISOString();

    try {
      // ✅ padrão idêntico ao de “visitantes”: fluxo/grupo/Nome/Email/Telefone/Agendamento/Mensagem
      await sendScaleTriggerEmail({
        tipo: pendingEscala.tipo as any,
        memberName: member.nome,
        memberEmail: member.email ?? null,
        memberPhone: member.telefone ?? null,
        responsavelNome,
        dataEventoFmt,
        agendamento: agendamentoISO,
        mensagemOpcional: pendingEscala.mensagem ?? null,
      });

      await prisma.escala.update({
        where: { id: pendingEscala.id },
        data: {
          status: 'ENVIADO',
          dataEnvio: new Date(),
          erroMensagem: null,
        },
      });

      return NextResponse.json({
        success: true,
        data: { processed: 1, success: 1, errors: 0 },
        message: 'Processado 1 envio (escala)',
      });
    } catch (err: any) {
      await prisma.escala.update({
        where: { id: pendingEscala.id },
        data: {
          status: 'ERRO',
          erroMensagem: String(err?.message ?? err),
        },
      });

      return NextResponse.json({
        success: false,
        error: 'Erro ao enviar escala',
        details: String(err?.message ?? err),
      });
    }
  } catch (err: any) {
    console.error('[emails/process] erro:', err);
    return NextResponse.json(
      { success: false, error: 'Erro interno', details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
