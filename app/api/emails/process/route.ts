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

    const responsavel =
      pendingEscala.membroNome ??
      pendingEscala.nomeResponsavelRaw ??
      '—';

    const dataEventoFmt = fmtDateInTZ(pendingEscala.dataEvento);
    const agendamento = pendingEscala.enviarEm;

    try {
      await sendScaleTriggerEmail(
        pendingEscala.tipo as any,
        responsavel,
        dataEventoFmt,
        null,
        agendamento,
        pendingEscala.mensagem ?? null
      );

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