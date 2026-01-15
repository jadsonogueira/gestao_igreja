export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type GroupType =
  | "aniversario"
  | "pastoral"
  | "devocional"
  | "visitantes"
  | "membros_sumidos";

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
    const body: unknown = await request.json();

    const grupo =
      typeof body === "object" && body !== null && "grupo" in body
        ? (body as { grupo?: unknown }).grupo
        : undefined;

    if (typeof grupo !== "string" || !validGroups.includes(grupo as GroupType)) {
      return NextResponse.json(
        { success: false, error: "Grupo inválido" },
        { status: 400 }
      );
    }

    const group = grupo as GroupType;

    let members: MemberMini[] = [];

    if (group === "aniversario") {
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
      const groupFieldMap: Record<
        Exclude<GroupType, "aniversario">,
        "grupoPastoral" | "grupoDevocional" | "grupoVisitantes" | "grupoSumidos"
      > = {
        pastoral: "grupoPastoral",
        devocional: "grupoDevocional",
        visitantes: "grupoVisitantes",
        membros_sumidos: "grupoSumidos",
      };

      const field = groupFieldMap[group as Exclude<GroupType, "aniversario">];

      members = (await prisma.member.findMany({
        where: { ativo: true, [field]: true },
        select: { id: true, nome: true, email: true, telefone: true },
      })) as MemberMini[];
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
        grupo: group,
        membroId: m.id,
        membroNome: m.nome ?? "",
        membroEmail: m.email ?? null,
        status: "pendente",
        dataAgendamento: new Date(),
      })),
    });

    await prisma.messageGroup.updateMany({
      where: { nomeGrupo: group },
      data: { ultimoEnvio: new Date() },
    });

    return NextResponse.json({
      success: true,
      data: { queued: members.length },
    });
  } catch (error) {
    console.error("Error queuing emails:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao enfileirar emails" },
      { status: 500 }
    );
  }
}
