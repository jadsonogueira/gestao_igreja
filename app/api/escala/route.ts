export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

function isValidYYYYMMDD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function startOfDayUTCFromYYYYMMDD(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function addDaysUTC(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function todayYYYYMMDD() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toISODate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const daysRaw = searchParams.get("days") ?? "60";
    const days = Math.max(1, Math.min(365, Number(daysRaw) || 60));

    const startStr =
      searchParams.get("start") ??
      searchParams.get("date") ??
      todayYYYYMMDD();

    if (!isValidYYYYMMDD(startStr)) {
      return NextResponse.json(
        { ok: false, error: "date inválida (use YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const timeMin = startOfDayUTCFromYYYYMMDD(startStr);
    const timeMax = addDaysUTC(timeMin, days);

    const rows = await prisma.escala.findMany({
      where: {
        dataEvento: { gte: timeMin, lt: timeMax },
      },
      orderBy: [{ dataEvento: "asc" }, { tipo: "asc" }],
      // ✅ opcional: select explícito (mais seguro/perf)
      select: {
        id: true,
        tipo: true,
        dataEvento: true,

        mensagem: true,

        membroId: true,
        membroNome: true,
        nomeResponsavelRaw: true,
        nomeResponsavel: true,

        envioAutomatico: true,
        enviarEm: true,

        status: true,
        erroMensagem: true,
        horario: true,

        // ✅ NOVO: data do envio (para mostrar no modal)
        dataEnvio: true,
      },
    });

    const items = (rows as any[]).map((r) => {
      const dataEventoISO = toISODate(r.dataEvento) ?? new Date().toISOString();

      const envioAutomatico =
        typeof r.envioAutomatico === "boolean" ? r.envioAutomatico : true;

      // ✅ Não inventa enviarEm se não existir
      const enviarEmISO = toISODate(r.enviarEm); // pode ser null

      const nomeResponsavel =
        r.membroNome ??
        r.nomeResponsavelRaw ??
        r.nomeResponsavel ??
        "—";

      return {
        id: r.id,
        tipo: r.tipo,
        dataEvento: dataEventoISO,

        nomeResponsavel,
        mensagem: r.mensagem ?? null,

        membroId: r.membroId ?? null,
        membroNome: r.membroNome ?? null,
        nomeResponsavelRaw: r.nomeResponsavelRaw ?? null,

        envioAutomatico,
        enviarEm: enviarEmISO,

        status: r.status ?? null,
        erroMensagem: r.erroMensagem ?? null,
        horario: r.horario ?? null,

        // ✅ NOVO
        dataEnvio: toISODate(r.dataEnvio),
      };
    });

    return NextResponse.json({
      ok: true,
      range: {
        days,
        start: startStr,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
      },
      items,
    });
  } catch (e: any) {
    console.error("GET /api/escala error:", e);
    return NextResponse.json(
      { ok: false, error: "Falha ao carregar escala" },
      { status: 500 }
    );
  }
}