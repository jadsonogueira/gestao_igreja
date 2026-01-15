import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type MemberMini = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  dataNascimento?: Date | null;
};

export async function POST() {
  try {
    // Hora atual em São Paulo (UTC-3)
    const now = new Date();
    const saoPauloOffset = -3 * 60; // minutos
    const saoPauloTime = new Date(now.getTime() + (saoPauloOffset - now.getTimezoneOffset()) * 60000);

    const currentHour = saoPauloTime.getHours();
    const currentDayOfWeek = saoPauloTime.getDay(); // 0-6
    const currentDayOfMonth = saoPauloTime.getDate(); // 1-31
    const today = new Date(saoPauloTime.getFullYear(), saoPauloTime.getMonth(), saoPauloTime.getDate());

    console.log(
      `[Schedule Check] ${saoPauloTime.toISOString()} - Hora: ${currentHour}, DOW: ${currentDayOfWeek}, DOM: ${currentDayOfMonth}`
    );

    const groupsRaw = await prisma.messageGroup.findMany({
      where: { ativo: true },
    });

    // Tipando pra evitar any
    const groups = groupsRaw as Array<{
      nomeGrupo: string;
      frequenciaEnvio: string | null;
      horaEnvio: number | null;
      diaSemana: number | null;
      diaMes: number | null;
      ultimoEnvio: Date | null;
    }>;

    const groupsToSend: string[] = [];

    for (const group of groups) {
      if (group.horaEnvio === null) continue;

      // evita duplicado no mesmo dia
      if (group.ultimoEnvio) {
        const last = new Date(group.ultimoEnvio);
        const lastOnly = new Date(last.getFullYear(), last.getMonth(), last.getDate());
        if (lastOnly.getTime() === today.getTime()) {
          console.log(`[Skip] Grupo ${group.nomeGrupo} já foi enviado hoje`);
          continue;
        }
      }

      // roda 1x por hora
      if (group.horaEnvio !== currentHour) continue;

      let shouldSend = false;

      switch (group.frequenciaEnvio) {
        case "aniversario":
        case "diaria":
          shouldSend = true;
          break;
        case "semanal":
          if (group.diaSemana === currentDayOfWeek) shouldSend = true;
          break;
        case "mensal":
          if (group.diaMes === currentDayOfMonth) shouldSend = true;
          break;
      }

      if (shouldSend) groupsToSend.push(group.nomeGrupo);
    }

    const results: any[] = [];

    for (const groupName of groupsToSend) {
      try {
        let members: MemberMini[] = [];

        if (groupName === "aniversario") {
          const currentMonth = saoPauloTime.getMonth() + 1;
          const currentDay = saoPauloTime.getDate();

          const birthdayCandidates = (await prisma.member.findMany({
            where: { ativo: true, dataNascimento: { not: null } },
            select: { id: true, nome: true, email: true, telefone: true, dataNascimento: true },
          })) as Array<MemberMini & { dataNascimento: Date | null }>;

          members = birthdayCandidates.filter((m) => {
            if (!m.dataNascimento) return false;
            const d = new Date(m.dataNascimento);
            const month = d.getUTCMonth() + 1;
            const day = d.getUTCDate();
            return month === currentMonth && day === currentDay;
          });
        } else {
          const groupFieldMap: Record<string, "grupoPastoral" | "grupoDevocional" | "grupoVisitantes" | "grupoSumidos"> = {
            pastoral: "grupoPastoral",
            devocional: "grupoDevocional",
            visitantes: "grupoVisitantes",
            membros_sumidos: "grupoSumidos",
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
          results.push({ group: groupName, success: true, queued: 0, message: "Nenhum membro encontrado" });
          console.log(`[Skip] Grupo ${groupName} - Nenhum membro encontrado`);
          continue;
        }

        await prisma.emailLog.createMany({
          data: members.map((m: MemberMini) => ({
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

        results.push({ group: groupName, success: true, queued: members.length });
        console.log(`[Queued] Grupo ${groupName} - ${members.length} emails agendados`);
      } catch (error) {
        console.error(`[Error] Grupo ${groupName}:`, error);
        results.push({
          group: groupName,
          success: false,
          error: error instanceof Error ? error.message : "Erro desconhecido",
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: groupsToSend.length,
      results,
      timestamp: saoPauloTime.toISOString(),
    });
  } catch (error) {
    console.error("[Schedule Check Error]:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro ao verificar agendamentos" },
      { status: 500 }
    );
  }
}
