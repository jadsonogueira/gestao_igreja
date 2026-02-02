export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Toronto";
const DEBUG_SCHEDULE = (process.env.DEBUG_SCHEDULE ?? "false").toLowerCase() === "true";

type MemberMini = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  dataNascimento?: Date | null;
};

function normalizeFrequency(value: string | null | undefined) {
  const v = (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (v === "diario" || v === "diaria") return "diaria";
  if (v === "semanal") return "semanal";
  if (v === "mensal") return "mensal";
  if (v === "aniversario") return "aniversario";
  return v;
}

function getNowPartsInTZ(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);

  const get = (t: string) => parts.find((p) => p.type === t)?.value;

  const year = Number(get("year") ?? "0");
  const month = Number(get("month") ?? "0");
  const day = Number(get("day") ?? "0");
  const hour = Number(get("hour") ?? "0");
  const minute = Number(get("minute") ?? "0");

  const weekdayStr = get("weekday") ?? "Sun";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = weekdayMap[weekdayStr] ?? 0;

  const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return { year, month, day, hour, minute, dow, dayKey };
}

function getBirthMonthDayUTC(d: Date | null | undefined) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return { month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function hhmm(h: number | null | undefined, m: number | null | undefined) {
  const hh = String(h ?? 0).padStart(2, "0");
  const mm = String(m ?? 0).padStart(2, "0");
  return `${hh}:${mm}`;
}

export async function POST() {
  try {
    let cfg = await prisma.systemConfig.findFirst();
    if (!cfg) cfg = await prisma.systemConfig.create({ data: { automacaoAtiva: true } });

    if (!cfg.automacaoAtiva) {
      return NextResponse.json({
        success: true,
        processed: 0,
        results: [],
        message: "Automação geral desativada",
      });
    }

    const now = new Date();
    const nowParts = getNowPartsInTZ(now);

    console.log(
      `[Schedule Check] TZ=${APP_TIMEZONE} ${now.toISOString()} | local=${nowParts.dayKey} ${String(
        nowParts.hour
      ).padStart(2, "0")}:${String(nowParts.minute).padStart(2, "0")} | dow=${nowParts.dow} | debug=${
        DEBUG_SCHEDULE ? "on" : "off"
      }`
    );

    const groups = await prisma.messageGroup.findMany({
      where: { ativo: true },
    });

    const groupsToSend: string[] = [];

    for (const group of groups) {
      const groupHour = group.horaEnvio ?? null;
      const groupMinute = group.minutoEnvio ?? 0;

      if (groupHour === null) continue;

      const timeReached =
        nowParts.hour > groupHour || (nowParts.hour === groupHour && nowParts.minute >= groupMinute);

      if (!timeReached) continue;

      if (group.ultimoEnvio) {
        const lastParts = getNowPartsInTZ(new Date(group.ultimoEnvio));
        if (lastParts.dayKey === nowParts.dayKey) continue;
      }

      const freq = normalizeFrequency(group.frequenciaEnvio);

      let shouldSend = false;

      switch (freq) {
        case "aniversario":
        case "diaria":
          shouldSend = true;
          break;
        case "semanal":
          shouldSend = group.diaSemana === nowParts.dow;
          break;
        case "mensal":
          shouldSend = group.diaMes === nowParts.day;
          break;
      }

      if (shouldSend) groupsToSend.push(group.nomeGrupo);
    }

    const results: any[] = [];

    for (const groupName of groupsToSend) {
      try {
        let members: MemberMini[] = [];

        if (groupName === "aniversario") {
          const { month: currentMonth, day: currentDay } = nowParts;

          const birthdayCandidates = (await prisma.member.findMany({
            where: { ativo: true, dataNascimento: { not: null } },
            select: { id: true, nome: true, email: true, telefone: true, dataNascimento: true },
          })) as Array<MemberMini & { dataNascimento: Date | null }>;

          members = birthdayCandidates.filter((m) => {
            const md = getBirthMonthDayUTC(m.dataNascimento ?? null);
            if (!md) return false;
            return md.month === currentMonth && md.day === currentDay;
          });
        } else {
          const groupFieldMap: Record<
            string,
            "grupoPastoral" | "grupoDevocional" | "grupoVisitantes" | "grupoSumidos" | "grupoConvite"
          > = {
            pastoral: "grupoPastoral",
            devocional: "grupoDevocional",
            visitantes: "grupoVisitantes",
            membros_sumidos: "grupoSumidos",
            convite: "grupoConvite",
          };

          const field = groupFieldMap[groupName];

          if (field) {
            members = (await prisma.member.findMany({
              where: { ativo: true, [field]: true },
              select: { id: true, nome: true, email: true, telefone: true },
            })) as MemberMini[];
          }
        }

        if (members.length === 0) {
          results.push({
            group: groupName,
            success: true,
            queued: 0,
            message: "Nenhum membro encontrado",
          });
          continue;
        }

        const memberIds = members.map((m) => m.id);

        const existingPending = await prisma.emailLog.findMany({
          where: {
            grupo: groupName,
            status: { in: ["pendente", "enviando"] },
            membroId: { in: memberIds },
          },
          select: { membroId: true },
        });

        const alreadyQueued = new Set(existingPending.map((x) => String(x.membroId)));
        const membersToQueue = members.filter((m) => !alreadyQueued.has(String(m.id)));

        if (membersToQueue.length === 0) {
          await prisma.messageGroup.updateMany({
            where: { nomeGrupo: groupName },
            data: { ultimoEnvio: new Date() },
          });

          results.push({
            group: groupName,
            success: true,
            queued: 0,
            message: "Todos já estavam na fila",
          });
          continue;
        }

        await prisma.emailLog.createMany({
          data: membersToQueue.map((m) => ({
            grupo: groupName,
            membroId: m.id,
            membroNome: m.nome ?? "",
            membroEmail: m.email ?? null,
            status: "pendente",
            dataAgendamento: new Date(),
          })),
        });

        await prisma.messageGroup.updateMany({
          where: { nomeGrupo: groupName },
          data: { ultimoEnvio: new Date() },
        });

        results.push({ group: groupName, success: true, queued: membersToQueue.length });
      } catch (error) {
        results.push({
          group: groupName,
          success: false,
          error: error instanceof Error ? error.message : "Erro desconhecido",
        });
      }
    }

    await prisma.systemConfig.updateMany({
      data: { ultimaVerificacao: new Date() },
    });

    return NextResponse.json({
      success: true,
      processed: groupsToSend.length,
      results,
      tz: APP_TIMEZONE,
      timestamp: now.toISOString(),
      checkedGroups: groups.length,
      groupsToSend,
      debug: DEBUG_SCHEDULE,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro ao verificar agendamentos" },
      { status: 500 }
    );
  }
}