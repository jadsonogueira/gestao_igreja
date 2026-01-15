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

    let created = 0;

    for (const grupo of grupos) {
      const exists = await prisma.messageGroup.findFirst({
        where: { nomeGrupo: grupo.nomeGrupo },
      });

      if (!exists) {
        await prisma.messageGroup.create({ data: grupo });
        created++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `${created} grupos criados com sucesso`,
    });
  } catch (error) {
    console.error("SEED ERROR:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao rodar seed" },
      { status: 500 }
    );
  }
}