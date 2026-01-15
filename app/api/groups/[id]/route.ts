export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const group = await prisma.messageGroup.findUnique({
      where: { id: params.id },
    });

    if (!group) {
      return NextResponse.json(
        { success: false, error: 'Grupo não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        _id: group.id,
        nome_grupo: group.nomeGrupo,
        mensagem_padrao: group.mensagemPadrao,
        frequencia_envio: group.frequenciaEnvio,
        dia_semana: group.diaSemana,
        dia_mes: group.diaMes,
        hora_envio: group.horaEnvio,
        minuto_envio: group.minutoEnvio ?? 0,
        flyer_url: group.flyerUrl,
        ultimo_envio: group.ultimoEnvio,
        proximo_envio: group.proximoEnvio,
        ativo: group.ativo,
      },
    });
  } catch (error) {
    console.error('Error fetching group:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao buscar grupo' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    const updateData: any = {};

    if (body.mensagem_padrao !== undefined) updateData.mensagemPadrao = body.mensagem_padrao;
    if (body.frequencia_envio !== undefined) updateData.frequenciaEnvio = body.frequencia_envio;
    if (body.dia_semana !== undefined) updateData.diaSemana = body.dia_semana;
    if (body.dia_mes !== undefined) updateData.diaMes = body.dia_mes;
    if (body.hora_envio !== undefined) updateData.horaEnvio = body.hora_envio;
    if (body.minuto_envio !== undefined) updateData.minutoEnvio = body.minuto_envio;
    if (body.flyer_url !== undefined) updateData.flyerUrl = body.flyer_url;
    if (body.ativo !== undefined) updateData.ativo = body.ativo;

    const group = await prisma.messageGroup.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: {
        _id: group.id,
        nome_grupo: group.nomeGrupo,
        mensagem_padrao: group.mensagemPadrao,
        frequencia_envio: group.frequenciaEnvio,
        dia_semana: group.diaSemana,
        dia_mes: group.diaMes,
        hora_envio: group.horaEnvio,
        minuto_envio: group.minutoEnvio ?? 0,
        flyer_url: group.flyerUrl,
        ultimo_envio: group.ultimoEnvio,
        proximo_envio: group.proximoEnvio,
        ativo: group.ativo,
      },
    });
  } catch (error) {
    console.error('Error updating group:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao atualizar grupo' },
      { status: 500 }
    );
  }
}
