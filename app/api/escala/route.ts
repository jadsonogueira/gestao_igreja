export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Toronto";

function ymdInTZ(date: Date, timeZone = APP_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";

  return `${y}-${m}-${d}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const daysRaw = Number(searchParams.get("days") ?? "60");
    const days = clamp(Number.isFinite(daysRaw) ? daysRaw : 60, 1, 365);

    // intervalo em UTC (suficiente porque o agrupamento por dia será em APP_TIMEZONE)
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

    const rows = await prisma.escala.findMany({
      where: {
        dataEvento: {
          gte: start,
          lt: end,
        },
      },
      orderBy: [{ dataEvento: "asc" }, { tipo: "asc" }],
    });

    // Agrupar por YYYY-MM-DD (no timezone do app)
    const map = new Map<string, any[]>();

    for (const r of rows) {
      const key = ymdInTZ(r.dataEvento as Date);
      if (!map.has(key)) map.set(key, []);

      map.get(key)!.push({
        id: r.id,
        tipo: r.tipo,
        nome: r.nomeResponsavel,
        mensagem: r.mensagem ?? null,
        envioAutomatico: r.envioAutomatico,
        enviarEm: (r.enviarEm as Date).toISOString(),
        status: r.status,
      });
    }

    // Gera lista contínua de dias (mesmo se vazio), como agenda
    const data: Array<{ date: string; items: any[] }> = [];
    for (let i = 0; i < days; i++) {
      const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const key = ymdInTZ(day);
      data.push({ date: key, items: map.get(key) ?? [] });
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    console.error("[GET /api/escala] error:", err);
    return NextResponse.json(
      { ok: false, error: "Falha ao carregar escala", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const tipo = String(body?.tipo ?? "");
    const nomeResponsavel = String(body?.nomeResponsavel ?? "").trim();

    if (!tipo) {
      return NextResponse.json({ ok: false, error: "Tipo é obrigatório" }, { status: 400 });
    }
    if (!nomeResponsavel) {
      return NextResponse.json({ ok: false, error: "Nome do responsável é obrigatório" }, { status: 400 });
    }

    const dataEvento = new Date(body?.dataEvento);
    if (Number.isNaN(dataEvento.getTime())) {
      return NextResponse.json({ ok: false, error: "dataEvento inválida" }, { status: 400 });
    }

    const enviarEm = new Date(body?.enviarEm);
    if (Number.isNaN(enviarEm.getTime())) {
      return NextResponse.json({ ok: false, error: "enviarEm inválido" }, { status: 400 });
    }

    const created = await prisma.escala.create({
      data: {
        tipo: tipo as any,
        dataEvento,
        horario: body?.horario ? String(body.horario).trim() : null,
        nomeResponsavel,
        mensagem: body?.mensagem ? String(body.mensagem).trim() : null,
        envioAutomatico: Boolean(body?.envioAutomatico ?? true),
        enviarEm,
        status: "PENDENTE" as any,
      },
    });

    return NextResponse.json({ ok: true, created });
  } catch (err: any) {
    console.error("[POST /api/escala] error:", err);
    return NextResponse.json(
      { ok: false, error: "Falha ao criar escala", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
