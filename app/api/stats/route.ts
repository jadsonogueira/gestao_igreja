export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Toronto";

function getTodayMonthDayInTimeZone(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const month = Number(parts.find((p) => p.type === "month")?.value ?? "0");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "0");

  return { month, day };
}

// ✅ NASCIMENTO em UTC (evita o "andar 1 dia")
function getBirthMonthDayUTC(dateInput: Date | string | null | undefined) {
  if (!dateInput) return null;

  const d = typeof dateInput === "string" ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  return {
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

// ✅ calcula próxima ocorrência do aniversário (ano atual ou próximo)
function nextBirthdayDate(month: number, day: number) {
  const now = new Date();

  const currentYear = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
    }).format(now)
  );

  const { month: cm, day: cd } = getTodayMonthDayInTimeZone(now);

  const isPast = month < cm || (month === cm && day < cd);
  const year = isPast ? currentYear + 1 : currentYear;

  // meio-dia UTC para evitar “voltar um dia” por fuso
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

type MemberBirth = {
  id: string;
  nome: string;
  dataNascimento: Date | null;
};

type MessageGroupRow = {
  id: string;
  nomeGrupo: string;
  mensagemPadrao: string | null;
  frequenciaEnvio: string | null;
  diaSemana: number | null;
  diaMes: number | null;
  horaEnvio: number | null;
  minutoEnvio: number | null;
  flyerUrl: string | null;
  ultimoEnvio: Date | null;
  proximoEnvio: Date | null;
  ativo: boolean;
};

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [totalMembers, activeMembers, emailsToday, pendingEmails] =
      await Promise.all([
        prisma.member.count(),
        prisma.member.count({ where: { ativo: true } }),
        prisma.emailLog.count({
          where: {
            dataEnvio: { gte: today, lt: tomorrow },
            status: "enviado",
          },
        }),
        prisma.emailLog.count({ where: { status: "pendente" } }),
      ]);

    const [pastoral, devocional, visitantes, sumidos, convite] = await Promise.all([
      prisma.member.count({ where: { grupoPastoral: true, ativo: true } }),
      prisma.member.count({ where: { grupoDevocional: true, ativo: true } }),
      prisma.member.count({ where: { grupoVisitantes: true, ativo: true } }),
      prisma.member.count({ where: { grupoSumidos: true, ativo: true } }),
      prisma.member.count({ where: { grupoConvite: true, ativo: true } }),
    ]);

    const membersWithBirth = (await prisma.member.findMany({
      where: { ativo: true, dataNascimento: { not: null } },
      select: { id: true, nome: true, dataNascimento: true },
    })) as MemberBirth[];

    // ✅ HOJE em Toronto
    const { month: currentMonth, day: currentDay } = getTodayMonthDayInTimeZone(
      new Date()
    );

    // ✅ NASCIMENTO em UTC (corrige o "dia 11 só aparece como 12")
    const aniversariantesHoje = membersWithBirth.reduce((acc, m) => {
      const md = getBirthMonthDayUTC(m.dataNascimento ?? null);
      if (!md) return acc;
      return md.month === currentMonth && md.day === currentDay ? acc + 1 : acc;
    }, 0);

    // ✅ Próximos aniversários (lista) — também usando UTC
    const proximosAniversariantes = membersWithBirth
      .map((m) => {
        const md = getBirthMonthDayUTC(m.dataNascimento);
        if (!md) return null;

        const next = nextBirthdayDate(md.month, md.day);

        return {
          _id: m.id,
          nome: m.nome,
          data_nascimento: m.dataNascimento,
          nextBirthday: next,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.nextBirthday.getTime() - b.nextBirthday.getTime())
      .slice(0, 6)
      .map(({ nextBirthday, ...rest }: any) => rest);

    const allGroups = (await prisma.messageGroup.findMany({
      orderBy: { nomeGrupo: "asc" },
    })) as MessageGroupRow[];

    const groupsWithCounts = allGroups.map((g) => {
      let memberCount = 0;
      let todayCount: number | undefined = undefined;

      switch (g.nomeGrupo) {
        case "aniversario":
          memberCount = activeMembers;
          todayCount = aniversariantesHoje;
          break;
        case "pastoral":
          memberCount = pastoral;
          break;
        case "devocional":
          memberCount = devocional;
          break;
        case "visitantes":
          memberCount = visitantes;
          break;
        case "membros_sumidos":
          memberCount = sumidos;
          break;
        case "convite":
          memberCount = convite;
          break;
      }

      return {
        _id: g.id,
        nome_grupo: g.nomeGrupo,
        mensagem_padrao: g.mensagemPadrao,
        frequencia_envio: g.frequenciaEnvio,
        dia_semana: g.diaSemana,
        dia_mes: g.diaMes,
        hora_envio: g.horaEnvio,
        minuto_envio: g.minutoEnvio ?? 0,
        flyer_url: g.flyerUrl,
        ultimo_envio: g.ultimoEnvio,
        proximo_envio: g.proximoEnvio,
        ativo: g.ativo,
        memberCount,
        todayCount,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        totalMembers,
        activeMembers,
        emailsToday,
        pendingEmails,
        membersByGroup: {
          aniversario: aniversariantesHoje,
          pastoral,
          devocional,
          visitantes,
          membros_sumidos: sumidos,
          convite,
        },
        groups: groupsWithCounts,
        proximosAniversariantes,
      },
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao buscar estatísticas" },
      { status: 500 }
    );
  }
}
