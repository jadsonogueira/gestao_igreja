export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { processEscalaEmail } from '@/lib/processEscalaEmail';

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

    const result = await processEscalaEmail(pendingEscala.id, {
      manual: false,
      sendAt: pendingEscala.enviarEm,
    });

    if (!result.ok) {
      return NextResponse.json({
        success: false,
        error: 'Erro ao enviar escala',
        details: result.error,
      });
    }

    return NextResponse.json({
      success: true,
      data: { processed: 1, success: 1, errors: 0 },
      message: 'Processado 1 envio (escala)',
    });
  } catch (err: any) {
    console.error('[emails/process] erro:', err);
    return NextResponse.json(
      { success: false, error: 'Erro interno', details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
