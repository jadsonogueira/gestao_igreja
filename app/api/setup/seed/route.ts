export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const grupos = [
      { nomeGrupo: "aniversario", mensagemPadrao: "Feliz aniversário!", frequenciaEnvio: "diario" },
      { nomeGrupo: "pastoral", mensagemPadrao: "Mensagem pastoral", frequenciaEnvio: "semanal" },
      { nomeGrupo: "devocional", mensagemPadrao: "Devocional diário", frequenciaEnvio: "diario" },
      { nomeGrupo: "visitantes", mensagemPadrao: "Bem-vindo!", frequenciaEnvio: "mensal" },
      { nomeGrupo: "membros_sumidos", mensagemPadrao: "Sentimos sua falta", frequenciaEnvio: "mensal" },
    ];

    for (const grupo of grupos) {
      await prisma.messageGroup.upsert({
        where: { nomeGrupo: grupo.nomeGrupo },
        update: {},
        create: grupo,
      });
    }

    return NextResponse.json({ success: true, message: "Seed executado com sucesso" });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Erro ao rodar seed" },
      { status: 500 }
    );
  }
}