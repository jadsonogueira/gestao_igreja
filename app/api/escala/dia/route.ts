export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'America/Toronto';

function startOfDayTZ(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const y = Number(parts.find((p) => p.type === 'year')?.value ?? '1970');
  const m = Number(parts.find((p) => p.type === 'month')?.value ?? '01');
  const d = Number(parts.find((p) => p.type === 'day')?.value ?? '01');

  // cria uma data UTC correspondente ao "início do dia" na TZ (aproximação segura pro filtro)
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

function endOfDayTZ(date: Date) {
  const s = startOfDayTZ(date);
  return new Date(s.getTime() + 24 * 60 * 60 * 1000);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get('date'); // YYYY-MM-DD
    if (!dateStr) {
      return NextResponse.json(
        { success: false, error: 'Parâmetro "date" é obrigatório (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const parsed = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Data inválida. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const dayStart = startOfDayTZ(parsed);
    const dayEnd = endOfDayTZ(parsed);

    const rows = await prisma.escala.findMany({
      where: {
        dataEvento: { gte: dayStart, lt: dayEnd },
      },
      orderBy: [{ tipo: 'asc' }],
    });

    const items = rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      dataEvento: (r.dataEvento as Date).toISOString(),

      // ✅ CORREÇÃO AQUI
      nomeResponsavel: r.membroNome ?? r.nomeResponsavelRaw ?? '—',

      mensagem: r.mensagem ?? null,
      envioAutomatico: r.envioAutomatico,
      enviarEm: (r.enviarEm as Date).toISOString(),
      status: r.status,
      dataEnvio: r.dataEnvio ? (r.dataEnvio as Date).toISOString() : null,
      erroMensagem: r.erroMensagem ?? null,
      createdAt: (r.createdAt as Date).toISOString(),
    }));

    return NextResponse.json({ success: true, data: { items } });
  } catch (err: any) {
    console.error('[escala/dia] erro:', err);
    return NextResponse.json(
      { success: false, error: 'Erro interno', details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}