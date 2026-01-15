export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import type { GroupType } from "@/lib/types";

const validGroups: GroupType[] = [
  "aniversario",
  "pastoral",
  "devocional",
  "visitantes",
  "membros_sumidos",
];

type MemberMini = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  dataNascimento?: Date | null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const grupo = body.grupo as GroupType;

    if (!grupo || !validGroups.includes(grupo)) {
      return NextResponse.json({ success: false, error: "Grupo inválido" }, { status: 400 });
    }

    let members: MemberMini[] = [];

    if (grupo === "aniversario") {
      // ✅ Mongo: pega ativos com dataNascimento e filtra por mês/dia
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const currentDay = today.getDate();

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

      const field = groupFieldMap[grupo];
      if (field) {
        members = (await prisma.member.findMany({
          where: {
            ativo: true,
            [field]: true,
          },
          select: { id: true, nome: true, email: true, telefone: true },
        })) as MemberMini[];
      }
    }

    if (members.length === 0) {
      return NextResponse.json({
        success: true,
        data: { queued: 0 },
        message: "Nenhum membro encontrado para este grupo",
      });
    }

    await prisma.emailLog.createMany({
      data: members.map((m: MemberMini) => ({
        grupo,
        membroId: m.id,
        membroNome: m.nome ?? "",
        membroEmail: m.email ?? null,
        status: "pendente",
        dataAgendamento: new Date(),
      })),
    });

    await prisma.messageGroup.updateMany({
      where: { nomeGrupo: grupo },
      data: { ultimoEnvio: new Date() },
    });

    return NextResponse.json({
      success: true,
      data: { queued: members.length },
    });
  } catch (error) {
    console.error("Error queuing emails:", error);
    return NextResponse.json({ success: false, error: "Erro ao enfileirar emails" }, { status: 500 });
  }
}
