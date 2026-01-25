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

function minutesDiff(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) / (60 * 1000);
}

/**
 * Se o enviarEm atual estiver "muito perto" do default do evento antigo,
 * consideramos que o usuário NÃO personalizou e podemos recalcular no update.
 */
function shouldRecalcEnviarEm(existingDataEvento: Date, existingEnviarEm: Date) {
  const oldDefault = defaultEnviarEmFromDataEvento(existingDataEvento);
  return minutesDiff(oldDefault, existingEnviarEm) <= 1; // <= 1 minuto
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

      const googleEventId = (ev.id ?? "").toString().trim() || null;

      // ✅ default enviarEm para NOVOS
      const newDefaultEnviarEm = defaultEnviarEmFromDataEvento(dateEvento);

      // ✅ 1) PRIMEIRO: tenta achar pelo googleEventId (evento pode ter mudado de data!)
      const existingByGoogle =
        googleEventId
          ? await prisma.escala.findFirst({
              where: {
                googleEventId,
                googleCalendarId: calendarId,
              },
            })
          : null;

      // ✅ 2) Fallback: tipo + dataEvento (legado / ou quando não tem googleEventId)
      const whereTipoData = {
        tipo_dataEvento: {
          tipo: roleEnum as any,
          dataEvento: dateEvento,
        },
      } as const;

      const existingByTipoData = await prisma.escala
        .findUnique({ where: whereTipoData })
        .catch(() => null);

      // =========================================================
      // CASO A: Existe pelo googleEventId -> atualiza MESMO SE mudou data/tipo
      // =========================================================
      if (existingByGoogle) {
        const targetId = existingByGoogle.id;

        // Antes de mudar tipo/data, pode existir outro registro ocupando essa chave (tipo+data).
        // Se existir e for outro ID, fazemos merge simples e removemos o duplicado.
        const conflict =
          existingByTipoData && existingByTipoData.id !== targetId
            ? existingByTipoData
            : null;

        let mergedFromConflict = false;

        if (conflict) {
          // merge: só preenche "vazios" do alvo com os dados do conflito
          const patch: any = {};

          // vínculo: preserva se já existe; senão herda do conflito
          if (!existingByGoogle.membroId && conflict.membroId) {
            patch.membroId = conflict.membroId;
            patch.membroNome = conflict.membroNome ?? null;
          }

          // mensagem: se alvo não tem, herda
          if (!existingByGoogle.mensagem && conflict.mensagem) {
            patch.mensagem = conflict.mensagem;
          }

          // envioAutomatico: se por algum motivo alvo veio undefined (não deveria), herda
          if (
            typeof existingByGoogle.envioAutomatico !== "boolean" &&
            typeof conflict.envioAutomatico === "boolean"
          ) {
            patch.envioAutomatico = conflict.envioAutomatico;
          }

          // enviarEm: se alvo não tem (não deveria), herda
          if (!existingByGoogle.enviarEm && conflict.enviarEm) {
            patch.enviarEm = conflict.enviarEm;
          }

          if (Object.keys(patch).length) {
            await prisma.escala.update({
              where: { id: targetId },
              data: patch,
            });
          }

          // remove o duplicado para liberar a chave unique (tipo_dataEvento)
          await prisma.escala.delete({ where: { id: conflict.id } });
          mergedFromConflict = true;
        }

        // Regra de ouro: se já está vinculado, não mexe
        const hasLink = !!existingByGoogle.membroId;
        if (hasLink) preservedLinks++;

        const finalMemberId = hasLink
          ? existingByGoogle.membroId
          : memberMatched?.id ?? null;

        const finalMemberNome = hasLink
          ? existingByGoogle.membroNome ?? null
          : memberMatched?.nome ?? null;

        // enviarEm: só recalcula se estava no default antigo
        let finalEnviarEm = existingByGoogle.enviarEm;
        if (
          existingByGoogle.envioAutomatico &&
          existingByGoogle.enviarEm &&
          shouldRecalcEnviarEm(existingByGoogle.dataEvento, existingByGoogle.enviarEm)
        ) {
          finalEnviarEm = newDefaultEnviarEm;
        }

        await prisma.escala.update({
          where: { id: targetId },
          data: {
            // ✅ atualiza chave do evento conforme Google
            tipo: roleEnum as any,
            dataEvento: dateEvento,

            // vínculo (preservado se já existia; senão tenta auto)
            membroId: finalMemberId,
            membroNome: finalMemberNome,

            // raw sempre atualizado
            nomeResponsavelRaw: nameRaw,

            // enviarEm: só muda se estava default
            enviarEm: finalEnviarEm,

            googleEventId,
            googleCalendarId: calendarId,
            source: "GOOGLE",
            lastSyncedAt: new Date(),
          },
        });

        updated++;

        if (sampleParsed.length < 14) {
          sampleParsed.push({
            roleEnum,
            title,
            nameRaw,
            cleaned,
            dateEvento: dateEvento.toISOString(),
            matchedMember: memberMatched?.nome ?? null,
            note: mergedFromConflict
              ? "updated_by_googleId_merge_conflict"
              : "updated_by_googleId",
          });
        }

        continue;
      }

      // =========================================================
      // CASO B: Não existe pelo googleEventId (ou não veio id)
      // usa tipo+dataEvento como sempre foi
      // =========================================================
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
            enviarEm: newDefaultEnviarEm,
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
            roleEnum,
            title,
            nameRaw,
            cleaned,
            dateEvento: dateEvento.toISOString(),
            matchedMember: memberMatched?.nome ?? null,
            note: "created_new",
          });
        }
        continue;
      }

      // existe pelo tipo+data (update padrão)
      const hasLink = !!existingByTipoData.membroId;
      if (hasLink) preservedLinks++;

      const finalMemberId = hasLink
        ? existingByTipoData.membroId
        : memberMatched?.id ?? null;

      const finalMemberNome = hasLink
        ? existingByTipoData.membroNome ?? null
        : memberMatched?.nome ?? null;

      // enviarEm: só recalcula se estava no default antigo
      let finalEnviarEm = existingByTipoData.enviarEm;
      if (
        existingByTipoData.envioAutomatico &&
        existingByTipoData.enviarEm &&
        shouldRecalcEnviarEm(existingByTipoData.dataEvento, existingByTipoData.enviarEm)
      ) {
        finalEnviarEm = newDefaultEnviarEm;
      }

      await prisma.escala.update({
        where: { id: existingByTipoData.id },
        data: {
          membroId: finalMemberId,
          membroNome: finalMemberNome,
          nomeResponsavelRaw: nameRaw,
          enviarEm: finalEnviarEm,
          googleEventId: googleEventId ?? existingByTipoData.googleEventId ?? null,
          googleCalendarId: calendarId,
          source: "GOOGLE",
          lastSyncedAt: new Date(),
        },
      });

      updated++;

      if (sampleParsed.length < 14) {
        sampleParsed.push({
          roleEnum,
          title,
          nameRaw,
          cleaned,
          dateEvento: dateEvento.toISOString(),
          matchedMember: memberMatched?.nome ?? null,
          note: hasLink ? "link_preserved_tipo_data" : "updated_tipo_data",
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