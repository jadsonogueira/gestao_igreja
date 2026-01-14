export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import type { GroupType } from '@/lib/types';

const validGroups: GroupType[] = ['aniversario', 'pastoral', 'devocional', 'visitantes', 'membros_sumidos'];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const grupo = body.grupo as GroupType;

    if (!grupo || !validGroups.includes(grupo)) {
      return NextResponse.json(
        { success: false, error: 'Grupo inválido' },
        { status: 400 }
      );
    }

    let members: any[] = [];

    if (grupo === 'aniversario') {
      // Get today's birthday members
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const currentDay = today.getDate();

      members = await prisma.$queryRaw`
        SELECT id, nome, email, telefone FROM members 
        WHERE ativo = true 
        AND EXTRACT(MONTH FROM "dataNascimento") = ${currentMonth}
        AND EXTRACT(DAY FROM "dataNascimento") = ${currentDay}
      `;
    } else {
      // Get members by group
      const groupFieldMap: Record<string, string> = {
        pastoral: 'grupoPastoral',
        devocional: 'grupoDevocional',
        visitantes: 'grupoVisitantes',
        membros_sumidos: 'grupoSumidos',
      };

      const field = groupFieldMap[grupo];
      if (field) {
        members = await prisma.member.findMany({
          where: {
            ativo: true,
            [field]: true,
          },
          select: { id: true, nome: true, email: true, telefone: true },
        });
      }
    }

    if (members.length === 0) {
      return NextResponse.json({
        success: true,
        data: { queued: 0 },
        message: 'Nenhum membro encontrado para este grupo',
      });
    }

    // Create email logs
    await prisma.emailLog.createMany({
      data: members.map((m) => ({
        grupo,
        membroId: m.id,
        membroNome: m.nome ?? '',
        membroEmail: m.email ?? null,
        status: 'pendente',
        dataAgendamento: new Date(),
      })),
    });

    // Update group's last send date
    await prisma.messageGroup.updateMany({
      where: { nomeGrupo: grupo },
      data: { ultimoEnvio: new Date() },
    });

    return NextResponse.json({
      success: true,
      data: { queued: members.length },
    });
  } catch (error) {
    console.error('Error queuing emails:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao enfileirar emails' },
      { status: 500 }
    );
  }
}
