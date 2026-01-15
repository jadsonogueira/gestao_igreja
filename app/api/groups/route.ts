export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

const defaultGroups = [
  { nomeGrupo: 'aniversario', frequenciaEnvio: 'aniversario', horaEnvio: 9, minutoEnvio: 0 },
  { nomeGrupo: 'pastoral', frequenciaEnvio: 'mensal', horaEnvio: 9, minutoEnvio: 0, diaMes: 1 },
  { nomeGrupo: 'devocional', frequenciaEnvio: 'diaria', horaEnvio: 7, minutoEnvio: 0 },
  { nomeGrupo: 'visitantes', frequenciaEnvio: 'semanal', horaEnvio: 10, minutoEnvio: 0, diaSemana: 1 },
  { nomeGrupo: 'membros_sumidos', frequenciaEnvio: 'semanal', horaEnvio: 9, minutoEnvio: 0, diaSemana: 1 },
];

export async function GET() {
  try {
    let groups = await prisma.messageGroup.findMany({
      orderBy: { nomeGrupo: 'asc' },
    });

    // Create default groups if none exist
    if (groups.length === 0) {
      await prisma.messageGroup.createMany({
        data: defaultGroups.map((g) => ({
          nomeGrupo: g.nomeGrupo,
          mensagemPadrao: '',
          frequenciaEnvio: g.frequenciaEnvio,
          horaEnvio: g.horaEnvio,
          minutoEnvio: g.minutoEnvio ?? 0,
          diaSemana: g.diaSemana ?? null,
          diaMes: g.diaMes ?? null,
          ativo: true,
        })),
      });

      groups = await prisma.messageGroup.findMany({
        orderBy: { nomeGrupo: 'asc' },
      });
    }

    // Transform to match frontend expectations
    const transformedGroups = groups.map((g: (typeof groups)[number]) => ({
      _id: g.id,
      nome_grupo: g.nomeGrupo,
      mensagem_padrao: g.mensagemPadrao,
      frequencia_envio: g.frequenciaEnvio,
      dia_semana: g.diaSemana,
      dia_mes: g.diaMes,
      hora_envio: g.horaEnvio,
      minuto_envio: g.minutoEnvio ?? 0,
      flyer_url: g.flyerUrl,
      ultimo_envio: g.ultimoEnvio,
      proximo_envio: g.proximoEnvio,
      ativo: g.ativo,
    }));

    return NextResponse.json({ success: true, data: transformedGroups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao buscar grupos' },
      { status: 500 }
    );
  }
}