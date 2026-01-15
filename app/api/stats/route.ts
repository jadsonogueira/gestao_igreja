export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

/* =======================
   TIPOS
======================= */

type UpcomingBirthdayItem = {
  _id: string;
  nome: string;
  data_nascimento: Date;
};

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

/* =======================
   HANDLER
======================= */

export async function GET() {
  try {
    /* Datas base */
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    /* Totais principais */
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

    /* Contagem por grupos fixos */
    const [pastoral, devocional, visitantes, sumidos] = await Promise.all([
      prisma.member.count({ where: { grupoPastoral: true, ativo: true } }),
      prisma.member.count({ where: { grupoDevocional: true, ativo: true } }),
      prisma.member.count({ where: { grupoVisitantes: true, ativo: true } }),
      prisma.member.count({ where: { grupoSumidos: true, ativo: true } }),
    ]);

    /* Membros com data de nascimento (Mongo-friendly) */
    const membersWithBirth = (await prisma.member.findMany({
      where: { ativo: true, dataNascimento: { not: null } },
      select: { id: true, nome: true, dataNascimento: true },
    })) as MemberBirth[];

    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();

    /* Aniversariantes de hoje */
    const aniversariantes = membersWithBirth.reduce(
      (acc: number, m: MemberBirth) => {
        if (!m.dataNascimento) return acc;

        const d = new Date(m.dataNascimento);
        const month = d.getUTCMonth() + 1;
        const day = d.getUTCDate();

        return month === currentMonth && day === currentDay ? acc + 1 : acc;
      },
      0
    );

    /* Próximos aniversariantes */
    const proximosAniversariantes: UpcomingBirthdayItem[] = membersWithBirth
      .map(
        (
          m: MemberBirth
        ): (UpcomingBirthdayItem & { daysUntil: number }) | null => {
          if (!m.dataNascimento) return null;

          const bday = new Date(m.dataNascimento);
          const bdayMonth = bday.getUTCMonth();
          const bdayDay = bday.getUTCDate();

          let thisYearBday = new Date(
            today.getFullYear(),
            bdayMonth,
            bdayDay
          );

          if (thisYearBday < today) {
            thisYearBday = new Date(
              today.getFullYear() + 1,
              bdayMonth,
              bdayDay
            );
          }

          const diffTime = thisYearBday.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          return {
            _id: m.id,
            nome: m.nome,
            data_nascimento: m.dataNascimento,
            daysUntil: diffDays,
          };
        }
      )
      .filter(
        (
          m
        ): m is UpcomingBirthdayItem & { daysUntil: number } =>
          m !== null && m.daysUntil >= 0 && m.daysUntil <= 30
      )
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 10)
      .map(({ daysUntil, ...rest }) => rest);

    /* Grupos de mensagens */
    const allGroups = (await prisma.messageGroup.findMany({
      orderBy: { nomeGrupo: "asc" },
    })) as MessageGroupRow[];

    const groupsWithCounts = allGroups.map((g: MessageGroupRow) => {
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

    /* Resposta */
    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao buscar estatísticas" },
      { status: 500 }
    );
  }
}
