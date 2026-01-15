export const dynamic = 'force-dynamic';
 
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
 
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
          status: 'enviado',
        },
      }),
      prisma.emailLog.count({ where: { status: 'pendente' } }),
    ]);
 
    // Get member counts by group
    const [pastoral, devocional, visitantes, sumidos] = await Promise.all([
      prisma.member.count({ where: { grupoPastoral: true, ativo: true } }),
      prisma.member.count({ where: { grupoDevocional: true, ativo: true } }),
      prisma.member.count({ where: { grupoVisitantes: true, ativo: true } }),
      prisma.member.count({ where: { grupoSumidos: true, ativo: true } }),
    ]);
 
    // Birthday (today)
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();
 
    let aniversariantes = 0;
 
    try {
      const birthdayMembers = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM members
        WHERE ativo = true
        AND EXTRACT(MONTH FROM "dataNascimento") = ${currentMonth}
        AND EXTRACT(DAY FROM "dataNascimento") = ${currentDay}
      `;
      aniversariantes = Number(birthdayMembers[0]?.count ?? 0);
    } catch (e) {
      console.error('Error getting birthday count:', e);
    }
 
    // Upcoming birthdays (next 30 days)
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
 
    type BirthdayWithDays = {
      _id: string;
      nome: string;
      data_nascimento: Date;
      daysUntil: number;
    }; 
 
    const proximosAniversariantes = upcomingBirthdays
      .map((m: (typeof upcomingBirthdays)[number]): BirthdayWithDays | null => {
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
      .filter((m: BirthdayWithDays | null): m is BirthdayWithDays => m !== null && m.daysUntil >= 0 && m.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 10)
      .map(({ daysUntil, ...rest }) => rest);
 
    // Groups with member counts
    const allGroups = await prisma.messageGroup.findMany({
      orderBy: { nomeGrupo: 'asc' },
    });
 
    const groupsWithCounts = allGroups.map(
      (g: (typeof allGroups)[number]) => {
        let memberCount = 0;
 
        switch (g.nomeGrupo) {
          case 'aniversario':
            memberCount = aniversariantes;
            break;
          case 'pastoral':
            memberCount = pastoral;
            break;
          case 'devocional':
            memberCount = devocional;
            break;
          case 'visitantes':
            memberCount = visitantes;
            break;
          case 'membros_sumidos':
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
      }
    );
 
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
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao buscar estatísticas' },
      { status: 500 }
    );
  }
}