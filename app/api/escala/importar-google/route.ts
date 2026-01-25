export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getValidGoogleAccessToken } from "@/lib/googleCalendar";

const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Toronto";

function startOfDayUTC(d: Date) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  );
}

/**
 * Regra padrão: enviar 6 dias antes do evento, às 15:00 UTC (estável).
 */
function defaultEnviarEmFromDataEvento(dateEventoUTC00: Date) {
  const d = startOfDayUTC(dateEventoUTC00);
  d.setUTCDate(d.getUTCDate() - 6);
  d.setUTCHours(15, 0, 0, 0);
  return d;
}

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
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function stripCommonPrefixes(name: string) {
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
  return `${y}-${m}-${d}`;
}

function toDateEventoFromGoogleStart(ev: GoogleEvent) {
  if (ev.start?.date) {
    return new Date(`${ev.start.date}T00:00:00.000Z`);
  }

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
        {
          ok: false,
          error:
            "GOOGLE_CALENDAR_ID não configurado (ou envie calendarId no body)",
        },
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
          details: {
            status: r.status,
            statusText: r.statusText,
            body: txt,
          },
        },
        { status: 500 }
      );
    }

    const data = await r.json();
    const events: GoogleEvent[] = Array.isArray(data?.items) ? data.items : [];

    // Members ativos (para auto-vínculo)
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
    let moved = 0; // ✅ quantos foram “movidos” (data mudou) por googleEventId
    let merged = 0; // ✅ quantos conflitaram e precisaram merge
    let parsed = 0;
    let ignored = 0;
    let matchedMembers = 0;
    let preservedLinks = 0;

    const sampleParsed: any[] = [];
    const ignoredList: any[] = [];

    for (const ev of events) {
      const title = (ev.summary ?? "").toString().trim();
      const parsedResult = parseRoleAndName(title);

      if (!parsedResult) {
        ignored++;
        if (ignoredList.length < 50)
          ignoredList.push({ title, reason: "title_not_matching_or_empty" });
        continue;
      }

      const dateEvento = toDateEventoFromGoogleStart(ev);
      if (!dateEvento) {
        ignored++;
        if (ignoredList.length < 50)
          ignoredList.push({ title, reason: "date_invalid" });
        continue;
      }

      parsed++;

      const { roleEnum, nameRaw } = parsedResult;

      // tenta casar member pelo nome (auto-vínculo)
      const cleaned = stripCommonPrefixes(nameRaw);
      const key1 = normalizeBasic(nameRaw);
      const key2 = normalizeBasic(cleaned);
      const memberMatched =
        memberIndex.get(key2) ?? memberIndex.get(key1) ?? null;

      if (memberMatched) matchedMembers++;

      const enviarEmDefault = defaultEnviarEmFromDataEvento(dateEvento);

      // ✅ 1) PRIMEIRO: achar pelo googleEventId (resolve “arrastar evento”)
      const googleEventId = (ev.id ?? "").trim() || null;

      let existingByGoogleId: any | null = null;
      if (googleEventId) {
        existingByGoogleId = await prisma.escala.findFirst({
          where: {
            googleEventId,
            googleCalendarId: calendarId,
          },
        });
      }

      // ✅ 2) Se não achou pelo googleEventId, cai no legado: tipo+dataEvento
      const whereByUnique = {
        tipo_dataEvento: {
          tipo: roleEnum as any,
          dataEvento: dateEvento,
        },
      };

      const existingByUnique = existingByGoogleId
        ? null
        : await prisma.escala.findUnique({ where: whereByUnique });

      const existing = existingByGoogleId ?? existingByUnique;

      // helper p/ preservar vínculo
      const hasLink = !!existing?.membroId;

      const finalMemberId = hasLink
        ? existing!.membroId
        : memberMatched?.id ?? null;

      const finalMemberNome = hasLink
        ? existing!.membroNome ?? null
        : memberMatched?.nome ?? null;

      if (existing && hasLink) preservedLinks++;

      // ✅ caso não exista nada: cria novo
      if (!existing) {
        await prisma.escala.create({
          data: {
            tipo: roleEnum as any,
            dataEvento: dateEvento,
            membroId: memberMatched?.id ?? null,
            membroNome: memberMatched?.nome ?? null,
            nomeResponsavelRaw: nameRaw,
            mensagem: null,
            envioAutomatico: true,
            enviarEm: enviarEmDefault,
            status: "PENDENTE",
            googleEventId,
            googleCalendarId: calendarId,
            source: "GOOGLE",
            lastSyncedAt: new Date(),
          },
        });
        created++;
      } else {
        // ✅ EXISTE: atualizar
        // Se veio pelo googleEventId, pode ter mudado data/tipo (evento movido)
        const cameFromGoogleId = !!existingByGoogleId;

        // Se for “movido”, pode dar conflito com o unique tipo+dataEvento
        if (cameFromGoogleId) {
          const conflict = await prisma.escala.findUnique({
            where: whereByUnique,
          });

          // conflito = já existe outro registro com esse tipo+dataEvento (e é outro id)
          if (conflict && conflict.id !== existing.id) {
            // ✅ MERGE: mantém o registro “conflict” (que bate no unique)
            // e apaga o antigo do googleEventId (evita duplicado/sobra)
            await prisma.$transaction([
              prisma.escala.update({
                where: { id: conflict.id },
                data: {
                  // garante que o googleEventId está no registro certo
                  googleEventId,
                  googleCalendarId: calendarId,
                  source: "GOOGLE",
                  lastSyncedAt: new Date(),

                  // mantém o raw sempre atualizado
                  nomeResponsavelRaw: nameRaw,

                  // preserva vínculo: se conflict não tem, mas o antigo tinha, copia
                  membroId: conflict.membroId ? conflict.membroId : finalMemberId,
                  membroNome: conflict.membroId
                    ? conflict.membroNome ?? null
                    : finalMemberNome,
                },
              }),
              prisma.escala.delete({ where: { id: existing.id } }),
            ]);

            merged++;
            updated++;

            if (sampleParsed.length < 14) {
              sampleParsed.push({
                roleEnum,
                title,
                nameRaw,
                cleaned,
                dateEvento: dateEvento.toISOString(),
                matchedMember: memberMatched?.nome ?? null,
                note: "merged_conflict_tipo_dataEvento",
              });
            }
            continue;
          }

          // ✅ sem conflito: atualiza o próprio registro pelo googleEventId
          await prisma.escala.update({
            where: { id: existing.id },
            data: {
              tipo: roleEnum as any,
              dataEvento: dateEvento,

              // vínculo preservado/auto preenchido se vazio
              membroId: finalMemberId,
              membroNome: finalMemberNome,

              nomeResponsavelRaw: nameRaw,

              googleEventId,
              googleCalendarId: calendarId,
              source: "GOOGLE",
              lastSyncedAt: new Date(),
            },
          });

          moved++;
          updated++;
        } else {
          // ✅ veio pelo unique (tipo+dataEvento): update normal (sem mexer em data/tipo)
          await prisma.escala.update({
            where: whereByUnique,
            data: {
              // vínculo preservado/auto preenchido se vazio
              membroId: finalMemberId,
              membroNome: finalMemberNome,

              nomeResponsavelRaw: nameRaw,

              googleEventId: googleEventId ?? existing.googleEventId ?? null,
              googleCalendarId: calendarId,
              source: "GOOGLE",
              lastSyncedAt: new Date(),
            },
          });

          updated++;
        }
      }

      if (sampleParsed.length < 14) {
        sampleParsed.push({
          roleEnum,
          title,
          nameRaw,
          cleaned,
          dateEvento: dateEvento.toISOString(),
          matchedMember: memberMatched?.nome ?? null,
          note: existing?.membroId
            ? "link_preserved"
            : memberMatched
              ? "linked_by_name"
              : "still_unlinked",
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
        moved,
        merged,
        ignored,
        matchedMembers,
        preservedLinks,
      },
      sampleParsed,
      ignored: ignoredList,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      {
        ok: false,
        error: "Erro ao importar do Google",
        details: String(err?.message ?? err),
      },
      { status: 500 }
    );
  }
}