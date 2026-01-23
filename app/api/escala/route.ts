export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

function isValidYYYYMMDD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function startOfDayUTCFromYYYYMMDD(dateStr: string) {
  // Interpreta como "dia" fixo e estável (00:00Z)
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function addDaysUTC(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function todayYYYYMMDD() {
  // Mantém simples: hoje no relógio do servidor, formatado YYYY-MM-DD
  // (se quiser, depois podemos amarrar no APP_TIMEZONE)
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const daysRaw = searchParams.get("days") ?? "60";
    const days = Math.max(1, Math.min(365, Number(daysRaw) || 60));

    // Aceita start=YYYY-MM-DD (preferido)
    // Aceita date=YYYY-MM-DD (compatibilidade)
    const startStr = searchParams.get("start") ?? searchParams.get("date") ?? todayYYYYMMDD();

    if (!isValidYYYYMMDD(startStr)) {
      return NextResponse.json(
        { ok: false, error: "date inválida (use YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const timeMin = startOfDayUTCFromYYYYMMDD(startStr);
    const timeMax = addDaysUTC(timeMin, days);

    const items = await prisma.escala.findMany({
      where: {
        dataEvento: {
          gte: timeMin,
          lt: timeMax,
        },
      },
      orderBy: [{ dataEvento: "asc" }, { tipo: "asc" }],
    });

    return NextResponse.json({
      ok: true,
      range: { days, start: startStr, timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() },
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