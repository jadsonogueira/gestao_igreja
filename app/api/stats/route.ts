// app/api/stats/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type UpcomingBirthdayItem = {
  _id: string;
  nome: string;
  data_nascimento: Date;
};

type GroupWithCounts = {
  _id: string;
  nome_grupo: string;
  mensagem_padrao: string | null;
  frequencia_envio: string | null;
  dia_semana: number | null;
  dia_mes: number | null;
  hora_envio: number | null;
  minuto_envio: number;
  flyer_url: string | null;
  ultimo_envio: Date | null;
  proximo_envio: Date | null;
  ativo: boolean;
  memberCount: number;
};

type StatsResponse =
  | {
      success: true;
      data: {
        totalMembers: number;
        activeMembers: number;
        emailsToday: number;
        pendingEmails: number;
        membersByGroup: {
          aniversario: number;
          pastoral: number;
          devocional: number;
          visitantes: number;
          membros_sumidos: number;
        };
        proximosAniversariantes: UpcomingBirthdayItem[];
        groups: GroupWithCounts[];
      };
    }
  | { success: false; error: string };

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [totalMembers, activeMembers, emailsToday, pendingEmails] = await Promise.all([
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

    const [pastoral, devocional, visitantes, sumidos] = await Promise.all([
      prisma.member.count({ where: { grupoPastoral: true, ativo: true } }),
      prisma.member.count({ where: { grupoDevocional: true, ativo: true } }),
      prisma.member.count({ where: { grupoVisitantes: true, ativo: true } }),
      prisma.member.count({ where: { grupoSumidos: true, ativo: true } }),
    ]);

    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();

    let aniversariantes = 0;

    // ✅ Postgres/SQL
    const birthdayMembers = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM members
      WHERE ativo = true
      AND EXTRACT(MONTH FROM "dataNascimento") = ${currentMonth}
      AND EXTRACT(DAY FROM "dataNascimento") = ${currentDay}
    `;
    aniversariantes = Number(birthdayMembers[0]?.count ?? 0);

    const upcomingBirthdays = await prisma.member.findMany({
      where: {
        ativo: true,
        dataNascimento: { not: null },
      },
      select: {
        id: true,
        nome: true,
        dataNascimento: true,
      },
    });

    const proximosAniversariantes: UpcomingBirthdayItem[] = upcomingBirthdays
      .map((m): (UpcomingBirthdayItem & { daysUntil: number }) | null => {
        if (!m.dataNascimento) return null;

        const bday = new Date(m.dataNascimento);
        const bdayMonth = bday.getUTCMonth();
        const bdayDay = bday.getUTCDate();

        let thisYearBday = new Date(today.getFullYear(), bdayMonth, bdayDay);

        if (thisYearBday < today) {
          thisYearBday = new Date(today.getFullYear() + 1, bdayMonth, bdayDay);
        }

        const diffTime = thisYearBday.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return {
          _id: m.id,
          nome: m.nome,
          data_nascimento: m.dataNascimento,
          daysUntil: diffDays,
        };
      })
      .filter((m): m is UpcomingBirthdayItem & { daysUntil: number } => !!m && m.daysUntil >= 0 && m.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 10)
      .map(({ daysUntil, ...rest }) => rest);

    const allGroups = await prisma.messageGroup.findMany({
      orderBy: { nomeGrupo: "asc" },
    });

    const groupsWithCounts: GroupWithCounts[] = allGroups.map((g) => {
      let memberCount = 0;

      switch (g.nomeGrupo) {
        case "aniversario":
          memberCount = aniversariantes;
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
      };
    });

    const payload: StatsResponse = {
      success: true,
      data: {
        totalMembers,
        activeMembers,
        emailsToday,
        pendingEmails,
        membersByGroup: {
          aniversario: aniversariantes,
          pastoral,
          devocional,
          visitantes,
          membros_sumidos: sumidos,
        },
        proximosAniversariantes,
        groups: groupsWithCounts,
      },
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao buscar estatísticas" } satisfies StatsResponse,
      { status: 500 }
    );
  }
}
