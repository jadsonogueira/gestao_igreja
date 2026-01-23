export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Toronto";

function parseYMD(ymd: string) {
  // basic validation YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return ymd;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Converte um "dia" (YYYY-MM-DD) no fuso APP_TIMEZONE
 * para um range UTC [start, end) de 24h daquele dia local.
 *
 * Sem libs externas (Luxon/Temporal), fazemos um ajuste iterativo.
 */
function tzDayRangeUTC(ymd: string, timeZone = APP_TIMEZONE) {
  const desiredLocalUTC = new Date(`${ymd}T00:00:00.000Z`); // representa "00:00" do dia desejado, tratado como UTC
  let utcGuess = new Date(desiredLocalUTC);

  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(utcGuess);

    const y = parts.find((p) => p.type === "year")?.value ?? "1970";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    const d = parts.find((p) => p.type === "day")?.value ?? "01";
    const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
    const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
    const ss = parts.find((p) => p.type === "second")?.value ?? "00";

    // "o que esse utcGuess virou no fuso", reinterpretado como UTC
    const currentLocalUTC = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}.000Z`);
    const deltaMs = currentLocalUTC.getTime() - desiredLocalUTC.getTime();

    // Ajusta o palpite de UTC para que no fuso ele caia exatamente no dia desejado 00:00
    utcGuess = new Date(utcGuess.getTime() - deltaMs);
  }

  const start = utcGuess;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

const ALL_TIPOS = [
  "DIRIGENTE",
  "LOUVOR",
  "LOUVOR_ESPECIAL",
  "PREGACAO",
  "TESTEMUNHO",
] as const;

type EscalaTipo = (typeof ALL_TIPOS)[number];

function isTipo(v: any): v is EscalaTipo {
  return ALL_TIPOS.includes(v);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateRaw = (searchParams.get("date") ?? "").trim();
    const date = parseYMD(dateRaw);

    if (!date) {
      return NextResponse.json(
        { ok: false, error: "date inválida (use YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const { start, end } = tzDayRangeUTC(date);

    const rows = await prisma.escala.findMany({
      where: {
        dataEvento: { gte: start, lt: end },
      },
      orderBy: [{ tipo: "asc" }],
    });

    // mapa por tipo (1 por função)
    const byTipo: Record<string, any | null> = {};
    for (const t of ALL_TIPOS) byTipo[t] = null;

    for (const r of rows) {
      byTipo[r.tipo] = {
        id: r.id,
        tipo: r.tipo,
        dataEvento: (r.dataEvento as Date).toISOString(),
        nomeResponsavel: r.nomeResponsavel,
        mensagem: r.mensagem ?? null,
        envioAutomatico: r.envioAutomatico,
        enviarEm: (r.enviarEm as Date).toISOString(),
        status: r.status,
      };
    }

    return NextResponse.json({
      ok: true,
      date,
      items: byTipo,
      timeZone: APP_TIMEZONE,
      rangeUTC: { start: start.toISOString(), end: end.toISOString() },
    });
  } catch (err: any) {
    console.error("[GET /api/escala/dia] error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Falha ao carregar dia",
        details: String(err?.message ?? err),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const dateRaw = String(body?.date ?? "").trim();
    const date = parseYMD(dateRaw);
    if (!date) {
      return NextResponse.json(
        { ok: false, error: "date inválida (use YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const entries = Array.isArray(body?.entries) ? body.entries : [];
    if (!Array.isArray(entries)) {
      return NextResponse.json(
        { ok: false, error: "entries precisa ser um array" },
        { status: 400 }
      );
    }

    const { start, end } = tzDayRangeUTC(date);

    // Carrega os existentes do dia para fazer update/create (sem unique composto por enquanto)
    const existing = await prisma.escala.findMany({
      where: { dataEvento: { gte: start, lt: end } },
    });

    const existingByTipo = new Map<string, any>();
    for (const r of existing) existingByTipo.set(r.tipo, r);

    const results: any[] = [];

    for (const raw of entries) {
      const tipo = String(raw?.tipo ?? "");
      if (!isTipo(tipo)) {
        continue; // ignora tipos inválidos
      }

      const nomeResponsavel = String(raw?.nomeResponsavel ?? "").trim();
      const mensagem = String(raw?.mensagem ?? "").trim();
      const envioAutomatico =
        typeof raw?.envioAutomatico === "boolean" ? raw.envioAutomatico : true;

      // enviarEm opcional: se não vier, usamos start do dia (UTC) + 12h como default
      let enviarEm: Date;
      if (raw?.enviarEm) {
        const d = new Date(raw.enviarEm);
        enviarEm = Number.isNaN(d.getTime())
          ? new Date(start.getTime() + 12 * 60 * 60 * 1000)
          : d;
      } else {
        enviarEm = new Date(start.getTime() + 12 * 60 * 60 * 1000);
      }

      const prev = existingByTipo.get(tipo);

      // ✅ Regra "limpar" no app:
      // - Não deletar
      // - Zera responsável
      // - Desativa envio automático
      // - Mantém mensagem vazia
      const isClear = nomeResponsavel.length === 0;

      if (prev) {
        const updated = await prisma.escala.update({
          where: { id: prev.id },
          data: {
            nomeResponsavel: isClear ? "" : nomeResponsavel,
            mensagem: isClear ? null : (mensagem ? mensagem : null),
            envioAutomatico: isClear ? false : envioAutomatico,
            enviarEm,
            // Mantemos status PENDENTE quando há responsável;
            // ao limpar, deixamos PENDENTE mas com envioAutomatico=false (não deve enviar).
            status: "PENDENTE" as any,
          },
        });
        results.push({ action: "updated", id: updated.id, tipo });
      } else {
        const created = await prisma.escala.create({
          data: {
            tipo: tipo as any,
            dataEvento: start, // salva o "dia" no começo do range UTC
            horario: null,
            nomeResponsavel: isClear ? "" : nomeResponsavel,
            mensagem: isClear ? null : (mensagem ? mensagem : null),
            envioAutomatico: isClear ? false : envioAutomatico,
            enviarEm,
            status: "PENDENTE" as any,
          },
        });
        results.push({ action: "created", id: created.id, tipo });
      }
    }

    // retorno pós-salvar: recarrega o dia
    const rows = await prisma.escala.findMany({
      where: { dataEvento: { gte: start, lt: end } },
      orderBy: [{ tipo: "asc" }],
    });

    const byTipo: Record<string, any | null> = {};
    for (const t of ALL_TIPOS) byTipo[t] = null;

    for (const r of rows) {
      byTipo[r.tipo] = {
        id: r.id,
        tipo: r.tipo,
        dataEvento: (r.dataEvento as Date).toISOString(),
        nomeResponsavel: r.nomeResponsavel,
        mensagem: r.mensagem ?? null,
        envioAutomatico: r.envioAutomatico,
        enviarEm: (r.enviarEm as Date).toISOString(),
        status: r.status,
      };
    }

    return NextResponse.json({
      ok: true,
      date,
      saved: results,
      items: byTipo,
    });
  } catch (err: any) {
    console.error("[POST /api/escala/dia] error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Falha ao salvar dia",
        details: String(err?.message ?? err),
      },
      { status: 500 }
    );
  }
}
