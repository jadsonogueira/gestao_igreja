export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import type { EscalaTipo } from '@/lib/types';

function parseBool(v: string | null) {
  if (v === null) return null;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const tipo = searchParams.get('tipo');
    const envioAutomatico = parseBool(searchParams.get('envioAutomatico'));
    const take = Math.min(Number(searchParams.get('take') ?? '50') || 50, 200);
    const skip = Math.max(Number(searchParams.get('skip') ?? '0') || 0, 0);

    const where: any = {};
    if (status) where.status = status;
    if (tipo) where.tipo = tipo;
    if (envioAutomatico !== null) where.envioAutomatico = envioAutomatico;

    const [items, total] = await Promise.all([
      prisma.escala.findMany({
        where,
        orderBy: [{ dataEvento: 'asc' }, { enviarEm: 'asc' }],
        take,
        skip,
      }),
      prisma.escala.count({ where }),
    ]);

    return NextResponse.json({ success: true, data: { items, total } });
  } catch (error) {
    console.error('Error fetching escala:', error);
    return NextResponse.json({ success: false, error: 'Erro ao buscar escala' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const tipo = String(body?.tipo ?? '') as EscalaTipo;
    const dataEvento = body?.dataEvento ? new Date(body.dataEvento) : null;
    const enviarEm = body?.enviarEm ? new Date(body.enviarEm) : null;

    if (!tipo) {
      return NextResponse.json({ success: false, error: 'Tipo é obrigatório' }, { status: 400 });
    }
    if (!dataEvento || Number.isNaN(dataEvento.getTime())) {
      return NextResponse.json({ success: false, error: 'dataEvento inválida' }, { status: 400 });
    }
    if (!enviarEm || Number.isNaN(enviarEm.getTime())) {
      return NextResponse.json({ success: false, error: 'enviarEm inválido' }, { status: 400 });
    }

    const nomeResponsavel = String(body?.nomeResponsavel ?? '').trim();
    if (!nomeResponsavel) {
      return NextResponse.json(
        { success: false, error: 'Nome do responsável é obrigatório' },
        { status: 400 }
      );
    }

    const item = await prisma.escala.create({
      data: {
        tipo,
        dataEvento,
        horario: body?.horario ? String(body.horario) : null,
        nomeResponsavel,
        mensagem: body?.mensagem ? String(body.mensagem) : null,
        envioAutomatico: body?.envioAutomatico === false ? false : true,
        enviarEm,
        status: 'PENDENTE',
      },
    });

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error('Error creating escala:', error);
    return NextResponse.json({ success: false, error: 'Erro ao criar escala' }, { status: 500 });
  }
}