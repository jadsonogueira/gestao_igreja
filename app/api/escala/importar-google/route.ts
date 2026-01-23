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
  return s.replace(/\s+/g, " ").trim();
}

// Aceita “Dirigente: João” (confirmado por você)
function parseRoleAndName(titleRaw: string) {
  const title = cleanSpaces(titleRaw || "");

  // Roles aceitos
  const roleMap: Record<string, string> = {
    dirigente: "DIRIGENTE",
    louvor: "LOUVOR",
    "louvor especial": "LOUVOR_ESPECIAL",
    pregação: "PREGACAO",
    pregacao: "PREGACAO",
    testemunho: "TESTEMUNHO",
  };

  // Regex: "Algo: Nome"
  const m = title.match(/^(.+?)\s*:\s*(.+)$/i);
  if (!m) return null;

  const roleRaw = cleanSpaces(m[1]);
  const nameRaw = cleanSpaces(m[2]);

  if (!roleRaw || !nameRaw) return null;

  const roleKey = roleRaw.toLowerCase();
  const roleEnum =
    roleMap[roleKey] ||
    roleMap[roleKey.normalize("NFD").replace(/[\u0300-\u036f]/g, "")];

  if (!roleEnum) return null;

  return { roleEnum, roleRaw, nameRaw, title };
}

function toDateEventoFromGoogleStart(ev: GoogleEvent) {
  // Prefer all-day date (YYYY-MM-DD)
  if (ev.start?.date) {
    // fixa em UTC meia-noite para evitar “pular dia”
    return new Date(`${ev.start.date}T00:00:00.000Z`);
  }

  if (ev.start?.dateTime) {
    const d = new Date(ev.start.dateTime);
    if (Number.isNaN(d.getTime())) return null;
    // normaliza para “dia” (UTC)
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  }

  return null;
}

function makeRange(days: number) {
  const now = new Date();
  // começo do dia UTC
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const days = Number(body?.days ?? 60);

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
          connected: false,
          reason: "google_api_error",
          details: { status: r.status, statusText: r.statusText, body: txt },
        },
        { status: 200 }
      );
    }

    const data = await r.json();
    const events: GoogleEvent[] = Array.isArray(data?.items) ? data.items : [];

    let created = 0;
    let updated = 0;
    let parsed = 0;
    let ignored = 0;

    const sampleParsed: any[] = [];
    const ignoredList: any[] = [];

    for (const ev of events) {
      const title = (ev.summary ?? "").toString().trim();
      const parsedResult = parseRoleAndName(title);

      if (!parsedResult) {
        ignored++;
        ignoredList.push({ title, reason: "title_not_matching_or_empty" });
        continue;
      }

      const dateEvento = toDateEventoFromGoogleStart(ev);
      if (!dateEvento) {
        ignored++;
        ignoredList.push({ title, reason: "date_invalid" });
        continue;
      }

      parsed++;

      const { roleEnum, roleRaw, nameRaw } = parsedResult;

      // Opção A: encontrar Member pelo nome (case-insensitive)
      const member = await prisma.member.findFirst({
        where: { nome: { equals: nameRaw, mode: "insensitive" } },
        select: { id: true, nome: true },
      });

      // enviarEm: por padrão = dataEvento (00:00Z).
      // Você pode mudar depois quando definirmos “quando enviar”.
      const enviarEm = dateEvento;

      const where = {
        tipo_dataEvento: {
          tipo: roleEnum as any,
          dataEvento: dateEvento,
        },
      };

      // Upsert (1 item por função por data)
      const existing = await prisma.escala.findUnique({ where });
      if (!existing) {
        await prisma.escala.create({
          data: {
            tipo: roleEnum as any,
            dataEvento: dateEvento,
            membroId: member?.id ?? null,
            membroNome: member?.nome ?? null,
            nomeResponsavelRaw: nameRaw,
            mensagem: null,
            envioAutomatico: true,
            enviarEm,
            status: "PENDENTE",
          },
        });
        created++;
      } else {
        await prisma.escala.update({
          where,
          data: {
            membroId: member?.id ?? null,
            membroNome: member?.nome ?? null,
            nomeResponsavelRaw: nameRaw,
            // Não mexe na mensagem do app
            // Não mexe no status se já enviou/erro, a menos que você queira
          },
        });
        updated++;
      }

      if (sampleParsed.length < 14) {
        const yyyy = dateEvento.getUTCFullYear();
        const mm = String(dateEvento.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(dateEvento.getUTCDate()).padStart(2, "0");
        sampleParsed.push({
          roleEnum,
          title,
          roleRaw,
          nameRaw,
          date: `${yyyy}-${mm}-${dd}`,
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