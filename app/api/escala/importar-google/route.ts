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
 * (Em Toronto isso dá ~10:00 no inverno, ~11:00 no verão por causa do DST).
 */
function defaultEnviarEmFromDataEvento(dateEventoUTC00: Date) {
  const d = startOfDayUTC(dateEventoUTC00);

  // ✅ 6 dias antes
  d.setUTCDate(d.getUTCDate() - 6);

  // horário estável
  d.setUTCHours(15, 0, 0, 0);

  return d;
}

function msDiff(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime());
}

/**
 * Se o enviarEm atual parece ser "o default" calculado anteriormente,
 * atualizamos para o novo default quando o evento muda de data.
 * Se o usuário editou manualmente, preservamos.
 */
function shouldUpdateEnviarEm(existingEnviarEm: Date, existingDataEvento: Date) {
  const oldDefault = defaultEnviarEmFromDataEvento(existingDataEvento);
  // tolerância de 2 minutos
  return msDiff(existingEnviarEm, oldDefault) <= 2 * 60 * 1000;
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
    let moved = 0; // ✅ eventos que já existiam pelo googleEventId e mudaram data/tipo
    let merged = 0; // ✅ quando precisou “fundir” por conflito de unique tipo+data
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
      const memberMatched = memberIndex.get(key2) ?? memberIndex.get(key1) ?? null;
      if (memberMatched) matchedMembers++;

      // ✅ registro “alvo” pela UNIQUE principal (tipo+dataEvento)
      const whereTipoData = {
        tipo_dataEvento: {
          tipo: roleEnum as any,
          dataEvento: dateEvento,
        },
      };

      // ✅ o mais importante: procurar pelo googleEventId (evento movido)
      const googleEventId = (ev.id ?? "").trim() || null;

      const existingByGoogle =
        googleEventId
          ? await prisma.escala.findFirst({
              where: {
                googleCalendarId: calendarId,
                googleEventId: googleEventId,
              },
            })
          : null;

      // calcular enviarEm default para ESTA data do evento
      const enviarEmDefaultNew = defaultEnviarEmFromDataEvento(dateEvento);

      // helper: decide vínculo final (preserva se já tinha)
      const pickLink = (existing: any) => {
        const hasLink = !!existing?.membroId;
        if (hasLink) {
          preservedLinks++;
          return { membroId: existing.membroId, membroNome: existing.membroNome ?? null, hasLink: true };
        }
        return { membroId: memberMatched?.id ?? null, membroNome: memberMatched?.nome ?? null, hasLink: false };
      };

      // ✅ CASO 1: já existe pelo googleEventId → atualizar/mover
      if (existingByGoogle) {
        const existing = existingByGoogle as any;

        const sameTipo = String(existing.tipo) === String(roleEnum);
        const sameDate = new Date(existing.dataEvento).getTime() === dateEvento.getTime();
        const willMove = !(sameTipo && sameDate);

        // vínculo
        const link = pickLink(existing);

        // enviarEm: atualiza só se parecia default antigo
        let enviarEmFinal = existing.enviarEm ? new Date(existing.enviarEm) : enviarEmDefaultNew;
        if (existing.enviarEm && existing.dataEvento) {
          const should = shouldUpdateEnviarEm(new Date(existing.enviarEm), new Date(existing.dataEvento));
          if (should) enviarEmFinal = enviarEmDefaultNew;
        } else {
          enviarEmFinal = enviarEmDefaultNew;
        }

        // ⚠️ se mudou tipo/data, pode conflitar com @@unique(tipo,dataEvento)
        // então checamos se já existe outro registro com esse tipo+data
        const existingTarget = await prisma.escala.findUnique({ where: whereTipoData });

        if (existingTarget && String(existingTarget.id) !== String(existing.id)) {
          // ✅ MERGE: manter o registro do target (porque ele já ocupa tipo+data)
          // e mover o googleEventId para ele; apagar o antigo.
          // preserva edição do target (mensagem/envioAutomatico/enviarEm/status etc.)
          // mas: se o target não tiver vínculo, tentamos preencher.
          const targetAny = existingTarget as any;
          const targetHasLink = !!targetAny.membroId;
          const targetLink = targetHasLink
            ? { membroId: targetAny.membroId, membroNome: targetAny.membroNome ?? null }
            : { membroId: link.membroId, membroNome: link.membroNome };

          // enviarEm do target: só seta default se estiver vazio
          const targetEnviarEmFinal = targetAny.enviarEm
            ? new Date(targetAny.enviarEm)
            : enviarEmDefaultNew;

          await prisma.escala.update({
            where: { id: targetAny.id },
            data: {
              // garante google ids
              googleEventId: googleEventId,
              googleCalendarId: calendarId,
              source: "GOOGLE",
              lastSyncedAt: new Date(),

              // atualiza raw sempre
              nomeResponsavelRaw: nameRaw,

              // tenta garantir vínculo se estava vazio
              membroId: targetLink.membroId,
              membroNome: targetLink.membroNome,

              // enviarEm só se estava vazio
              enviarEm: targetEnviarEmFinal,

              // (não mexe em mensagem/envioAutomatico/status do target)
            },
          });

          await prisma.escala.delete({ where: { id: existing.id } }).catch(() => null);

          merged++;
          if (willMove) moved++;

          if (sampleParsed.length < 14) {
            sampleParsed.push({
              mode: "merge",
              googleEventId,
              fromId: existing.id,
              toId: targetAny.id,
              roleEnum,
              dateEvento: dateEvento.toISOString(),
              matchedMember: memberMatched?.nome ?? null,
            });
          }

          continue;
        }

        // ✅ sem conflito: atualiza o MESMO registro (mover)
        await prisma.escala.update({
          where: { id: existing.id },
          data: {
            tipo: roleEnum as any,
            dataEvento: dateEvento,

            // vínculo
            membroId: link.membroId,
            membroNome: link.membroNome,

            // raw
            nomeResponsavelRaw: nameRaw,

            // enviarEm (respeita manual)
            enviarEm: enviarEmFinal,

            // google meta
            googleEventId: googleEventId,
            googleCalendarId: calendarId,
            source: "GOOGLE",
            lastSyncedAt: new Date(),
          },
        });

        updated++;
        if (willMove) moved++;

        if (sampleParsed.length < 14) {
          sampleParsed.push({
            mode: willMove ? "moved" : "updated",
            googleEventId,
            id: existing.id,
            roleEnum,
            dateEvento: dateEvento.toISOString(),
            matchedMember: memberMatched?.nome ?? null,
            note: link.hasLink ? "link_preserved" : (memberMatched ? "linked_by_name" : "still_unlinked"),
          });
        }

        continue;
      }

      // ✅ CASO 2: não achou pelo googleEventId → fluxo antigo (tipo+data)
      const existingByTipoData = await prisma.escala.findUnique({ where: whereTipoData });

      if (!existingByTipoData) {
        // cria novo
        await prisma.escala.create({
          data: {
            tipo: roleEnum as any,
            dataEvento: dateEvento,

            membroId: memberMatched?.id ?? null,
            membroNome: memberMatched?.nome ?? null,
            nomeResponsavelRaw: nameRaw,

            mensagem: null,
            envioAutomatico: true,
            enviarEm: enviarEmDefaultNew,
            status: "PENDENTE",

            googleEventId,
            googleCalendarId: calendarId,
            source: "GOOGLE",
            lastSyncedAt: new Date(),
          },
        });
        created++;

        if (sampleParsed.length < 14) {
          sampleParsed.push({
            mode: "created",
            googleEventId,
            roleEnum,
            dateEvento: dateEvento.toISOString(),
            matchedMember: memberMatched?.nome ?? null,
          });
        }
      } else {
        // atualiza existente tipo+data (preservando vínculo se já havia)
        const existing = existingByTipoData as any;
        const hasLink = !!existing.membroId;

        const finalMemberId = hasLink ? existing.membroId : (memberMatched?.id ?? null);
        const finalMemberNome = hasLink ? (existing.membroNome ?? null) : (memberMatched?.nome ?? null);
        if (hasLink) preservedLinks++;

        // enviarEm: se estiver vazio, seta default
        const enviarEmFinal = existing.enviarEm ? new Date(existing.enviarEm) : enviarEmDefaultNew;

        await prisma.escala.update({
          where: whereTipoData,
          data: {
            membroId: finalMemberId,
            membroNome: finalMemberNome,
            nomeResponsavelRaw: nameRaw,

            // não mexe em mensagem/status/envioAutomatico
            enviarEm: enviarEmFinal,

            googleEventId: googleEventId ?? existing.googleEventId ?? null,
            googleCalendarId: calendarId,
            source: "GOOGLE",
            lastSyncedAt: new Date(),
          },
        });

        updated++;

        if (sampleParsed.length < 14) {
          sampleParsed.push({
            mode: "updated_tipo_data",
            googleEventId,
            roleEnum,
            dateEvento: dateEvento.toISOString(),
            matchedMember: memberMatched?.nome ?? null,
            note: hasLink ? "link_preserved" : (memberMatched ? "linked_by_name" : "still_unlinked"),
          });
        }
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