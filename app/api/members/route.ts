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
        case 'convite':
          where.grupoConvite = true;
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
        convite: (m as any).grupoConvite ?? false,
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

    // ✅ normaliza telefone no POST também
    let telefoneFinal: string | null = null;
    if (body.telefone !== undefined && body.telefone !== null) {
      const raw = String(body.telefone ?? '').trim();
      if (raw) {
        const digits = onlyDigits(raw);
        if (digits.length < 7) {
          return NextResponse.json(
            { success: false, error: 'Telefone inválido' },
            { status: 400 }
          );
        }
        telefoneFinal = toE164(raw);
      }
    }

    const member = await prisma.member.create({
      data: {
        nome: body.nome,
        email: body.email ?? null,
        telefone: telefoneFinal, // ✅ agora grava em E.164 (ou null)
        dataNascimento: body.data_nascimento ? new Date(body.data_nascimento) : null,
        endereco: body.endereco ?? null,
        grupoPastoral: body.grupos?.pastoral ?? false,
        grupoDevocional: body.grupos?.devocional ?? false,
        grupoVisitantes: body.grupos?.visitantes ?? false,
        grupoConvite: body.grupos?.convite ?? false,
        grupoSumidos: body.grupos?.membros_sumidos ?? false,
        redeRelacionamento: body.rede_relacionamento ?? null,
        ativo: body.ativo ?? true,
      } as any,
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
          convite: (member as any).grupoConvite ?? false,
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
