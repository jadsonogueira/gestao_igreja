export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const member = await prisma.member.findUnique({
      where: { id: params.id },
    });

    if (!member) {
      return NextResponse.json(
        { success: false, error: 'Membro não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        _id: member.id,
        nome: member.nome,
        email: member.email,
        telefone: member.telefone,
        data_nascimento: member.dataNascimento,
        endereco: member.endereco,
        grupos: {
          pastoral: member.grupoPastoral,
          devocional: member.grupoDevocional,
          visitantes: member.grupoVisitantes,
          membros_sumidos: member.grupoSumidos,
        },
        rede_relacionamento: member.redeRelacionamento,
        ativo: member.ativo,
      },
    });
  } catch (error) {
    console.error('Error fetching member:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao buscar membro' },
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

    if (body.nome !== undefined) updateData.nome = body.nome;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.telefone !== undefined) updateData.telefone = body.telefone;
    if (body.data_nascimento !== undefined) {
      updateData.dataNascimento = body.data_nascimento ? new Date(body.data_nascimento) : null;
    }
    if (body.endereco !== undefined) updateData.endereco = body.endereco;
    if (body.grupos?.pastoral !== undefined) updateData.grupoPastoral = body.grupos.pastoral;
    if (body.grupos?.devocional !== undefined) updateData.grupoDevocional = body.grupos.devocional;
    if (body.grupos?.visitantes !== undefined) updateData.grupoVisitantes = body.grupos.visitantes;
    if (body.grupos?.membros_sumidos !== undefined) updateData.grupoSumidos = body.grupos.membros_sumidos;
    if (body.rede_relacionamento !== undefined) updateData.redeRelacionamento = body.rede_relacionamento;
    if (body.ativo !== undefined) updateData.ativo = body.ativo;

    const member = await prisma.member.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: {
        _id: member.id,
        nome: member.nome,
        email: member.email,
        telefone: member.telefone,
        data_nascimento: member.dataNascimento,
        endereco: member.endereco,
        grupos: {
          pastoral: member.grupoPastoral,
          devocional: member.grupoDevocional,
          visitantes: member.grupoVisitantes,
          membros_sumidos: member.grupoSumidos,
        },
        rede_relacionamento: member.redeRelacionamento,
        ativo: member.ativo,
      },
    });
  } catch (error) {
    console.error('Error updating member:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao atualizar membro' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.member.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting member:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao excluir membro' },
      { status: 500 }
    );
  }
}
