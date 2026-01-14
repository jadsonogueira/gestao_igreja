export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const grupo = searchParams.get('grupo') ?? '';
    const status = searchParams.get('status') ?? '';
    const dataInicio = searchParams.get('dataInicio') ?? '';
    const dataFim = searchParams.get('dataFim') ?? '';
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = parseInt(searchParams.get('limit') ?? '20');

    const where: any = {};

    if (grupo) where.grupo = grupo;
    if (status) where.status = status;
    if (dataInicio || dataFim) {
      where.createdAt = {};
      if (dataInicio) where.createdAt.gte = new Date(dataInicio);
      if (dataFim) {
        const endDate = new Date(dataFim);
        endDate.setDate(endDate.getDate() + 1);
        where.createdAt.lt = endDate;
      }
    }

    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.emailLog.count({ where }),
    ]);

    // Transform to match frontend
    const transformedLogs = logs.map((l) => ({
      _id: l.id,
      grupo: l.grupo,
      membro_id: l.membroId,
      membro_nome: l.membroNome,
      membro_email: l.membroEmail,
      status: l.status,
      data_agendamento: l.dataAgendamento,
      data_envio: l.dataEnvio,
      mensagem_enviada: l.mensagemEnviada,
      erro_mensagem: l.erroMensagem,
      createdAt: l.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: transformedLogs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching email logs:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao buscar histórico' },
      { status: 500 }
    );
  }
}
