export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getValidGoogleAccessToken } from "@/lib/googleCalendar";

const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Toronto";

type GoogleEvent = {
  id?: string;
  summary?: string | null;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

function cleanSpaces(s: string) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function normalizeBasic(s: string) {
  return cleanSpaces(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase();
}

function stripCommonPrefixes(name: string) {
  // remove títulos comuns para casar com Member.nome
  let s = cleanSpaces(name);

  s = s.replace(/^pr\.?\s+/i, "");
  s = s.replace(/^pra\.?\s+/i, "");
  s = s.replace(/^pastor(a)?\s+/i, "");
  s = s.replace(/^ir\.?\s+/i, "");
  s = s.replace(/^irm(a|ã)\.?\s+/i, "");
  s = s.replace(/^irm(a|ã)o\s+/i, "");

  return cleanSpaces(s);
}

// Aceita “Dirigente: João”
function parseRoleAndName(titleRaw: string) {
  const title = cleanSpaces(titleRaw || "");

  const roleMap: Record<string, string> = {
    dirigente: "DIRIGENTE",
    louvor: "LOUVOR",
    "louvor especial": "LOUVOR_ESPECIAL",
    pregação: "PREGACAO",
    pregacao: "PREGACAO",
    testemunho: "TESTEMUNHO",
    apoio: "APOIO",
  };

  const m = title.match(/^(.+?)\s*:\s*(.+)$/i);
  if (!m) return null;

  const roleRaw = cleanSpaces(m[1]);
  const nameRaw = cleanSpaces(m[2]);

  if (!roleRaw || !nameRaw) return null;

  const roleKey = normalizeBasic(roleRaw);
  const roleEnum = roleMap[roleKey];

  if (!roleEnum) return null;

  return { roleEnum, roleRaw, nameRaw, title };
}

function getYMDInTZ(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

function toDateEventoFromGoogleStart(ev: GoogleEvent) {
  // All-day (YYYY-MM-DD) -> mantém o dia fixo
  if (ev.start?.date) {
    return new Date(`${ev.start.date}T00:00:00.000Z`);
  }

  // dateTime -> normaliza para o dia no fuso do app (Toronto)
  if (ev.start?.dateTime) {
    const d = new Date(ev.start.dateTime);
    if (Number.isNaN(d.getTime())) return null;

    const ymd = getYMDInTZ(d, APP_TIMEZONE);
    return new Date(`${ymd}T00:00:00.000Z`);
  }

  return null;
}

function makeRange(days: number) {
  const now = new Date();
  const ymd = getYMDInTZ(now, APP_TIMEZONE);

  // começamos do "hoje" no fuso do app, guardando como 00:00Z daquele YMD
  const start = new Date(`${ymd}T00:00:00.000Z`);
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.max(1, Math.min(365, Number(body?.days ?? 60)));

    const calendarId = String(
      body?.calendarId ?? process.env.GOOGLE_CALENDAR_ID ?? ""
    ).trim();

    if (!calendarId) {
      return NextResponse.json(
        { ok: false, error: "GOOGLE_CALENDAR_ID não configurado (ou envie calendarId no body)" },
        { status: 400 }
      );
    }

    const accessToken = await getValidGoogleAccessToken();
    const { timeMin, timeMax } = makeRange(days);

    const url =
      "https://www.googleapis.com/calendar/v3/calendars/" +
      encodeURIComponent(calendarId) +
      "/events?" +
      new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
      }).toString();

    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          reason: "google_api_error",
          details: { status: r.status, statusText: r.statusText, body: txt },
        },
        { status: 500 }
      );
    }

    const data = await r.json();
    const events: GoogleEvent[] = Array.isArray(data?.items) ? data.items : [];

    // ✅ Carrega members uma vez e cria índice normalizado (melhora match e performance)
    const members = await prisma.member.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
    });

    const memberIndex = new Map<string, { id: string; nome: string }>();
    for (const m of members) {
      memberIndex.set(normalizeBasic(m.nome), m);
    }

    let created = 0;
    let updated = 0;
    let parsed = 0;
    let ignored = 0;
    let matchedMembers = 0;

    const sampleParsed: any[] = [];
    const ignoredList: any[] = [];

    for (const ev of events) {
      const title = (ev.summary ?? "").toString().trim();
      const parsedResult = parseRoleAndName(title);

      if (!parsedResult) {
        ignored++;
        if (ignoredList.length < 50) ignoredList.push({ title, reason: "title_not_matching_or_empty" });
        continue;
      }

      const dateEvento = toDateEventoFromGoogleStart(ev);
      if (!dateEvento) {
        ignored++;
        if (ignoredList.length < 50) ignoredList.push({ title, reason: "date_invalid" });
        continue;
      }

      parsed++;

      const { roleEnum, roleRaw, nameRaw } = parsedResult;

      // ✅ tenta casar Member por nome (com remoção de prefixos e normalização)
      const cleaned = stripCommonPrefixes(nameRaw);
      const key1 = normalizeBasic(nameRaw);
      const key2 = normalizeBasic(cleaned);

      const member = memberIndex.get(key2) ?? memberIndex.get(key1) ?? null;
      if (member) matchedMembers++;

      // enviarEm: por enquanto mantém no dia do evento (00:00Z do YMD)
      // (depois refinamos para "X dias antes às 09:00 Toronto" se você quiser)
      const enviarEm = dateEvento;

      const where = {
        tipo_dataEvento: {
          tipo: roleEnum as any,
          dataEvento: dateEvento,
        },
      };

      const existing = await prisma.escala.findUnique({ where });

      if (!existing) {
        await prisma.escala.create({
          data: {
            tipo: roleEnum as any,
            dataEvento: dateEvento,
            membroId: member?.id ?? null,
            membroNome: member?.nome ?? null,
            nomeResponsavelRaw: nameRaw, // ✅ salva o texto cru vindo do calendar
            mensagem: null,
            envioAutomatico: true,
            enviarEm,
            status: "PENDENTE",
          },
        });
        created++;
      } else {
        // ✅ atualiza apenas dados de vínculo e raw. Não mexe em mensagem/status.
        await prisma.escala.update({
          where,
          data: {
            membroId: member?.id ?? null,
            membroNome: member?.nome ?? null,
            nomeResponsavelRaw: nameRaw,
          },
        });
        updated++;
      }

      if (sampleParsed.length < 14) {
        sampleParsed.push({
          roleEnum,
          title,
          roleRaw,
          nameRaw,
          cleaned,
          dateEvento: dateEvento.toISOString(),
          matchedMember: member?.nome ?? null,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      range: { days, timeMin, timeMax, timeZoneApp: APP_TIMEZONE },
      totals: {
        googleEvents: events.length,
        parsed,
        created,
        updated,
        ignored,
        matchedMembers,
      },
      sampleParsed,
      ignored: ignoredList,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { ok: false, error: "Erro ao importar do Google", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
