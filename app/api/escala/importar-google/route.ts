export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getGoogleCalendarClient } from "@/lib/googleCalendar";

type ImportItem = {
  date: string; // YYYY-MM-DD (all-day)
  title: string;
  roleRaw: string;
  nameRaw: string;
  roleEnum:
    | "DIRIGENTE"
    | "LOUVOR"
    | "LOUVOR_ESPECIAL"
    | "PREGACAO"
    | "TESTEMUNHO"
    | "APOIO";
};

function normalize(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/\s+/g, " ")
    .replace(/[–—-]/g, "-");
}

function mapRoleToEnum(roleRaw: string): ImportItem["roleEnum"] | null {
  const r = normalize(roleRaw);

  if (r === "dirigente") return "DIRIGENTE";
  if (r === "louvor") return "LOUVOR";
  if (r === "louvor especial") return "LOUVOR_ESPECIAL";
  if (r === "pregacao" || r === "pregação") return "PREGACAO";
  if (r === "testemunho") return "TESTEMUNHO";
  if (r === "apoio") return "APOIO";

  return null;
}

function parseTitle(title: string) {
  // padrão: "Função: Nome"
  const idx = title.indexOf(":");
  if (idx === -1) return null;

  const roleRaw = title.slice(0, idx).trim();
  const nameRaw = title.slice(idx + 1).trim();

  if (!roleRaw || !nameRaw) return null;

  const roleEnum = mapRoleToEnum(roleRaw);
  if (!roleEnum) return null;

  // Se o usuário colocar "Função: -" no Google, a gente considera vazio e ignora
  if (nameRaw === "-" || nameRaw === "—") return null;

  return { roleRaw, nameRaw, roleEnum };
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function yyyyMmDd(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const days: number = Number(body?.days ?? 90);
    const maxDays = Math.min(Math.max(days, 1), 365);

    const now = new Date();
    const timeMin = new Date(`${yyyyMmDd(now)}T00:00:00.000Z`);
    const timeMax = new Date(`${yyyyMmDd(addDays(now, maxDays))}T00:00:00.000Z`);

    const { googleFetch, calendarId } = await getGoogleCalendarClient();

    // Listar eventos no range
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: "2500",
    });

    const res = await googleFetch(
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: "Falha ao listar eventos do Google Calendar",
          details: { status: res.status, statusText: res.statusText, body: txt.slice(0, 500) },
        },
        { status: 500 }
      );
    }

    const json: any = await res.json();
    const items: any[] = Array.isArray(json?.items) ? json.items : [];

    const parsed: ImportItem[] = [];
    const ignored: { title: string; reason: string }[] = [];

    for (const ev of items) {
      const title = String(ev?.summary ?? "").trim();
      if (!title) continue;

      // Só consideramos eventos ALL-DAY (start.date)
      const date = ev?.start?.date as string | undefined;
      if (!date) {
        ignored.push({ title, reason: "not_all_day" });
        continue;
      }

      const p = parseTitle(title);
      if (!p) {
        ignored.push({ title, reason: "title_not_matching_or_empty" });
        continue;
      }

      parsed.push({
        date,
        title,
        roleRaw: p.roleRaw,
        nameRaw: p.nameRaw,
        roleEnum: p.roleEnum,
      });
    }

    // Salvar no banco: upsert lógico (por tipo + dia)
    // Como não temos unique composto no Prisma/Mongo, fazemos findFirst por range do dia.
    let created = 0;
    let updated = 0;

    for (const item of parsed) {
      const dayStart = new Date(`${item.date}T00:00:00.000Z`);
      const dayEnd = new Date(`${yyyyMmDd(addDays(dayStart, 1))}T00:00:00.000Z`);

      const existing = await prisma.escala.findFirst({
        where: {
          tipo: item.roleEnum,
          dataEvento: { gte: dayStart, lt: dayEnd },
        },
      });

      if (existing) {
        await prisma.escala.update({
          where: { id: existing.id },
          data: {
            nomeResponsavel: item.nameRaw,
            dataEvento: dayStart, // garante padronização
            horario: null,
          },
        });
        updated++;
      } else {
        await prisma.escala.create({
          data: {
            tipo: item.roleEnum,
            dataEvento: dayStart,
            horario: null,
            nomeResponsavel: item.nameRaw,
            mensagem: null,
            envioAutomatico: true,
            // enviarEm: por enquanto igual à data (00:00). Você vai ajustar depois quando definirmos regra.
            enviarEm: dayStart,
            status: "PENDENTE",
          },
        });
        created++;
      }
    }

    return NextResponse.json({
      ok: true,
      range: { days: maxDays, timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() },
      totals: {
        googleEvents: items.length,
        parsed: parsed.length,
        ignored: ignored.length,
        created,
        updated,
      },
      ignored, // para você ver quais títulos não bateram no padrão
      sampleParsed: parsed.slice(0, 20),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}