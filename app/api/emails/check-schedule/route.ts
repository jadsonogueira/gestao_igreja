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
  return v; // fallback
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
    // ✅ respeita automacao geral
    let cfg = await prisma.systemConfig.findFirst();
    if (!cfg) cfg = await prisma.systemConfig.create({ data: { automacaoAtiva: true } });

    if (!cfg.automacaoAtiva) {
      return NextResponse.json({
        success: true,
        processed: 0,
        results: [],
        message: "Automação geral desativada (SystemConfig.automacaoAtiva=false)",
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

    // ✅ busca todos os grupos ativos
    const groupsRaw = await prisma.messageGroup.findMany({
      where: { ativo: true },
    });

    const groups = groupsRaw as Array<{
      nomeGrupo: string;
      frequenciaEnvio: string | null;
      horaEnvio: number | null;
      minutoEnvio: number | null;
      diaSemana: number | null;
      diaMes: number | null;
      ultimoEnvio: Date | null;
    }>;

    if (DEBUG_SCHEDULE) {
      console.log(
        `[Schedule Check] grupos ativos (${groups.length}):`,
        groups.map((g) => ({
          nome: g.nomeGrupo,
          freq: normalizeFrequency(g.frequenciaEnvio),
          horario: hhmm(g.horaEnvio, g.minutoEnvio),
          diaSemana: g.diaSemana,
          diaMes: g.diaMes,
          ultimoEnvio: g.ultimoEnvio ? new Date(g.ultimoEnvio).toISOString() : null,
        }))
      );
    }

    const groupsToSend: string[] = [];

    for (const group of groups) {
      const groupHour = group.horaEnvio ?? null;
      const groupMinute = group.minutoEnvio ?? 0;

      // Se não tem hora, não agenda automático
      if (groupHour === null) {
        if (DEBUG_SCHEDULE) console.log(`[Decision] ${group.nomeGrupo} -> IGNORADO (horaEnvio=null)`);
        continue;
      }

      // ✅ catch-up do dia: se já passou do horário programado, ainda pode enviar (se não enviou hoje)
      const timeReached =
        nowParts.hour > groupHour || (nowParts.hour === groupHour && nowParts.minute >= groupMinute);

      if (!timeReached) {
        if (DEBUG_SCHEDULE) {
          console.log(`[Decision] ${group.nomeGrupo} -> AINDA NAO (${hhmm(groupHour, groupMinute)})`);
        }
        continue;
      }

      // ✅ evita duplicado no mesmo dia (no timezone da app)
      if (group.ultimoEnvio) {
        const lastParts = getNowPartsInTZ(new Date(group.ultimoEnvio));
        if (lastParts.dayKey === nowParts.dayKey) {
          console.log(`[Skip] ${group.nomeGrupo} já foi enviado hoje (${lastParts.dayKey})`);
          continue;
        }
      }

      const freq = normalizeFrequency(group.frequenciaEnvio);

      let shouldSend = false;
      let reason = "";

      switch (freq) {
        case "aniversario":
        case "diaria":
          shouldSend = true;
          reason = `freq=${freq}`;
          break;

        case "semanal":
          shouldSend = group.diaSemana === nowParts.dow;
          reason = `freq=semanal (diaSemana=${group.diaSemana} vs hoje=${nowParts.dow})`;
          break;

        case "mensal":
          shouldSend = group.diaMes === nowParts.day;
          reason = `freq=mensal (diaMes=${group.diaMes} vs hoje=${nowParts.day})`;
          break;

        default:
          shouldSend = false;
          reason = `freq=${freq || "vazia"} (nao reconhecida)`;
          break;
      }

      if (!shouldSend) {
        if (DEBUG_SCHEDULE) console.log(`[Decision] ${group.nomeGrupo} -> NAO ENVIA (${reason})`);
        continue;
      }

      if (DEBUG_SCHEDULE) console.log(`[Decision] ${group.nomeGrupo} -> ENVIAR (${reason})`);
      groupsToSend.push(group.nomeGrupo);
    }

    const results: any[] = [];

    for (const groupName of groupsToSend) {
      try {
        let members: MemberMini[] = [];

        if (groupName === "aniversario") {
          // ✅ Hoje (timezone da app)
          const { month: currentMonth, day: currentDay } = nowParts;

          // ✅ Nascimento sempre por UTC month/day (evita “voltar um dia” no Canadá)
          const birthdayCandidates = (await prisma.member.findMany({
            where: { ativo: true, dataNascimento: { not: null } },
            select: { id: true, nome: true, email: true, telefone: true, dataNascimento: true },
          })) as Array<MemberMini & { dataNascimento: Date | null }>;

          members = birthdayCandidates.filter((m) => {
            const md = getBirthMonthDayUTC(m.dataNascimento ?? null);
            if (!md) return false;
            return md.month === currentMonth && md.day === currentDay;
          });

          if (DEBUG_SCHEDULE) {
            console.log(
              `[Members] aniversario -> candidatos=${birthdayCandidates.length} | aniversariantesHoje=${members.length} (hoje ${currentMonth}/${currentDay})`
            );
          }
        } else {
          // ✅ INCLUIU "convite"
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

          if (DEBUG_SCHEDULE) {
            console.log(`[Members] ${groupName} -> field=${field ?? "N/A"} | membros=${members.length}`);
          }
        }

        if (members.length === 0) {
          results.push({
            group: groupName,
            success: true,
            queued: 0,
            message:
              groupName === "aniversario" ? "Nenhum aniversariante hoje" : "Nenhum membro encontrado",
          });
          console.log(`[Skip] ${groupName} - nenhum membro`);
          continue;
        }

        // ✅ Anti-duplicação: se já existe pendente/enviando para o mesmo membro+grupo, não cria de novo
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
          results.push({
            group: groupName,
            success: true,
            queued: 0,
            message: "Todos já estavam na fila (pendente/enviando)",
          });
          console.log(`[Skip] ${groupName} - todos já estavam na fila`);

          // Marca ultimoEnvio mesmo assim, para não tentar de novo no mesmo dia
          await prisma.messageGroup.updateMany({
            where: { nomeGrupo: groupName },
            data: { ultimoEnvio: new Date() },
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
        console.log(`[Queued] ${groupName} - ${membersToQueue.length} email(s)`);
      } catch (error) {
        console.error(`[Error] Grupo ${groupName}:`, error);
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
    console.error("[Schedule Check Error]:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro ao verificar agendamentos" },
      { status: 500 }
    );
  }
}