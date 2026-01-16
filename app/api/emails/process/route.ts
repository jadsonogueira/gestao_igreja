export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { sendTriggerEmail } from '@/lib/email-service';
import type { GroupType } from '@/lib/types';

export async function POST() {
  try {
    // Get next pending email
    const pendingEmail = await prisma.emailLog.findFirst({
      where: { status: 'pendente' },
      orderBy: { dataAgendamento: 'asc' },
    });

    if (!pendingEmail) {
      return NextResponse.json({
        success: true,
        data: { processed: 0, success: 0, errors: 0 },
        message: 'Nenhum email pendente',
      });
    }

    // Mark as sending
    await prisma.emailLog.update({
      where: { id: pendingEmail.id },
      data: { status: 'enviando' },
    });

    // Get group config and member
    const [group, member] = await Promise.all([
      prisma.messageGroup.findFirst({ where: { nomeGrupo: pendingEmail.grupo } }),
      prisma.member.findUnique({ where: { id: pendingEmail.membroId } }),
    ]);

    if (!member) {
      await prisma.emailLog.update({
        where: { id: pendingEmail.id },
        data: { status: 'erro', erroMensagem: 'Membro não encontrado' },
      });
      return NextResponse.json({
        success: true,
        data: { processed: 1, success: 0, errors: 1 },
      });
    }

    // Format date
    const agendamento = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Send trigger email com flyerUrl para anexo
 const automationTo = process.env.AUTOMATION_EMAIL_TO;

if (!automationTo) {
  await prisma.emailLog.update({
    where: { id: pendingEmail.id },
    data: { status: 'erro', erroMensagem: 'AUTOMATION_EMAIL_TO não configurado' },
  });

  return NextResponse.json(
    { success: false, error: 'AUTOMATION_EMAIL_TO não configurado' },
    { status: 500 }
  );
}

const result = await sendTriggerEmail(
  pendingEmail.grupo as GroupType,
  member.nome ?? '',
  automationTo, // ✅ destino fixo
  member.telefone ?? '',
  agendamento,
  group?.mensagemPadrao ?? '',
  group?.flyerUrl
);

    if (result.success) {
      await prisma.emailLog.update({
        where: { id: pendingEmail.id },
        data: {
          status: 'enviado',
          dataEnvio: new Date(),
          mensagemEnviada: group?.mensagemPadrao ?? '',
        },
      });

      return NextResponse.json({
        success: true,
        data: { processed: 1, success: 1, errors: 0 },
      });
    } else {
      await prisma.emailLog.update({
        where: { id: pendingEmail.id },
        data: { status: 'erro', erroMensagem: result.message ?? 'Erro desconhecido' },
      });

      return NextResponse.json({
        success: true,
        data: { processed: 1, success: 0, errors: 1 },
      });
    }
  } catch (error) {
    console.error('Error processing email:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao processar email' },
      { status: 500 }
    );
  }
}
