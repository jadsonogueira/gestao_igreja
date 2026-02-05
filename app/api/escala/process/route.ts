export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { processEscalaEmail } from "@/lib/processEscalaEmail";

export async function POST() {
  try {
    const now = new Date();

    // pega 1 item por vez (o mais antigo vencido)
    const next = await prisma.escala.findFirst({
      where: {
        envioAutomatico: true,
        status: "PENDENTE",
        enviarEm: { lte: now },
      },
      orderBy: { enviarEm: "asc" },
      select: { id: true },
    });

    if (!next) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: "Nenhuma escala pendente para envio",
      });
    }

    const result = await processEscalaEmail(next.id, {
      manual: false,
      sendAt: now,
    });

    return NextResponse.json({
      ok: result.ok,
      processed: 1,
      escalaId: next.id,
      status: result.status,
      error: result.error ?? null,
    });
  } catch (err: any) {
    console.error("[escala/process] erro:", err);
    return NextResponse.json(
      { ok: false, error: "Erro ao processar envio automático da escala" },
      { status: 500 }
    );
  }
}