export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') ?? '';
    const grupo = searchParams.get('grupo') ?? '';
    const status = searchParams.get('status') ?? '';
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = parseInt(searchParams.get('limit') ?? '20');

    const where: any = {};

    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (grupo) {
      switch (grupo) {
        case 'pastoral':
          where.grupoPastoral = true;
          break;
        case 'devocional':
          where.grupoDevocional = true;
          break;
        case 'visitantes':
          where.grupoVisitantes = true;
          break;
        case 'membros_sumidos':
          where.grupoSumidos = true;
          break;
      }
    }

    if (status === 'ativo') {
      where.ativo = true;
    } else if (status === 'inativo') {
      where.ativo = false;
    }

    const [members, total] = await Promise.all([
      prisma.member.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.member.count({ where }),
    ]);

    // Transform to match frontend expectations
    const transformedMembers = members.map((m: (typeof members)[number]) => ({
      _id: m.id,
      nome: m.nome,
      email: m.email,
      telefone: m.telefone,
      data_nascimento: m.dataNascimento,
      endereco: m.endereco,
      grupos: {
        pastoral: m.grupoPastoral,
        devocional: m.grupoDevocional,
        visitantes: m.grupoVisitantes,
        membros_sumidos: m.grupoSumidos,
      },
      rede_relacionamento: m.redeRelacionamento,
      ativo: m.ativo,
      createdAt: m.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: transformedMembers,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao buscar membros' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const member = await prisma.member.create({
      data: {
        nome: body.nome,
        email: body.email ?? null,
        telefone: body.telefone ?? null,
        dataNascimento: body.data_nascimento ? new Date(body.data_nascimento) : null,
        endereco: body.endereco ?? null,
        grupoPastoral: body.grupos?.pastoral ?? false,
        grupoDevocional: body.grupos?.devocional ?? false,
        grupoVisitantes: body.grupos?.visitantes ?? false,
        grupoSumidos: body.grupos?.membros_sumidos ?? false,
        redeRelacionamento: body.rede_relacionamento ?? null,
        ativo: body.ativo ?? true,
      },
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
    console.error('Error creating member:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao criar membro' },
      { status: 500 }
    );
  }
}