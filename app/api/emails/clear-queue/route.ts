export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const key = (body?.key as string | undefined) ?? "";

    const adminKey = process.env.ADMIN_CLEAR_KEY;
    if (!adminKey) {
      return NextResponse.json(
        { success: false, error: "ADMIN_CLEAR_KEY não configurada" },
        { status: 500 }
      );
    }

    if (!key || key !== adminKey) {
      return NextResponse.json(
        { success: false, error: "Não autorizado" },
        { status: 401 }
      );
    }

    // Apaga somente PENDENTES (e opcionalmente ENVIANDO travado, se quiser)
    const result = await prisma.emailLog.deleteMany({
      where: { status: "pendente" },
    });

    return NextResponse.json({
      success: true,
      deleted: result.count,
      message: "Fila de pendentes limpa",
    });
  } catch (error: any) {
    console.error("CLEAR QUEUE ERROR:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao limpar fila", detail: error?.message },
      { status: 500 }
    );
  }
}