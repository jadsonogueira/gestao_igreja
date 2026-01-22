export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

function onlyDigits(input: string) {
  return input.replace(/\D/g, '');
}

function toE164(input: string) {
  const digits = onlyDigits(input);

  const DEFAULT_COUNTRY_CODE = onlyDigits(process.env.DEFAULT_COUNTRY_CODE ?? '1'); // Render: DEFAULT_COUNTRY_CODE=1

  // Brasil já com DDI (55 + DDD + número)
  if (digits.startsWith('55') && digits.length >= 12) {
    return `+${digits}`;
  }

  // América do Norte já com DDI 1 (11 dígitos)
  if (digits.startsWith('1') && digits.length === 11) {
    return `+${digits}`;
  }

  // América do Norte local (10 dígitos) => adiciona +1
  if (digits.length === 10) {
    return `+${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  // Fallback: prefixa o default
  return `+${DEFAULT_COUNTRY_CODE}${digits}`;
}

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
          convite: (member as any).grupoConvite ?? false, // ✅ NOVO
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

    // ✅ Telefone: salva sempre em E.164 se vier no body
    if (body.telefone !== undefined) {
      const raw = String(body.telefone ?? '').trim();
      if (!raw) {
        updateData.telefone = null;
      } else {
        const digits = onlyDigits(raw);
        if (digits.length < 7) {
          return NextResponse.json(
            { success: false, error: 'Telefone inválido' },
            { status: 400 }
          );
        }
        updateData.telefone = toE164(raw);
      }
    }

    if (body.data_nascimento !== undefined) {
      updateData.dataNascimento = body.data_nascimento
        ? new Date(body.data_nascimento)
        : null;
    }

    if (body.endereco !== undefined) updateData.endereco = body.endereco;

    if (body.grupos?.pastoral !== undefined)
      updateData.grupoPastoral = body.grupos.pastoral;

    if (body.grupos?.devocional !== undefined)
      updateData.grupoDevocional = body.grupos.devocional;

    if (body.grupos?.visitantes !== undefined)
      updateData.grupoVisitantes = body.grupos.visitantes;

    // ✅ NOVO
    if (body.grupos?.convite !== undefined)
      updateData.grupoConvite = body.grupos.convite;

    if (body.grupos?.membros_sumidos !== undefined)
      updateData.grupoSumidos = body.grupos.membros_sumidos;

    if (body.rede_relacionamento !== undefined)
      updateData.redeRelacionamento = body.rede_relacionamento;

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
          convite: (member as any).grupoConvite ?? false, // ✅ NOVO
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