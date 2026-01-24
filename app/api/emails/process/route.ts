export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendScaleTriggerEmail } from "@/lib/sendScaleTriggerEmail";

const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Toronto";

function fmtDateInTZ(d: Date) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  return `${day}/${month}/${year}`;
}

export async function POST() {
  try {
    // =========================================================
    // 1) PRIORIDADE: EmailLog (grupos) — processa 1 por execução
    // =========================================================

    const pendingEmail = await prisma.emailLog.findFirst({
      where: { status: "pendente" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (pendingEmail) {
      // ✅ Claim atômico (anti-race):
      // Só avança se AINDA estiver pendente.
      const claimed = await prisma.emailLog.updateMany({
        where: { id: pendingEmail.id, status: "pendente" },
        data: { status: "enviando" },
      });

      if (claimed.count === 0) {
        // alguém já pegou esse item
        return NextResponse.json({
          success: true,
          data: { processed: 0, success: 0, errors: 0 },
          message: "Outro worker já processou este EmailLog",
        });
      }

      // TODO: seu envio real do EmailLog (Resend etc.) fica aqui.
      // Por enquanto mantido como estava no seu código (marcando como enviado).

      await prisma.emailLog.update({
        where: { id: pendingEmail.id },
        data: { status: "enviado", dataEnvio: new Date() },
      });

      return NextResponse.json({
        success: true,
        data: { processed: 1, success: 1, errors: 0 },
        message: "Processado 1 envio (grupo)",
      });
    }

    // =========================================================
    // 2) Escala — processa 1 por execução
    // =========================================================

    const now = new Date();

    const pendingEscala = await prisma.escala.findFirst({
      where: {
        status: "PENDENTE",
        envioAutomatico: true,
        enviarEm: { lte: now },
      },
      orderBy: { enviarEm: "asc" },
      select: {
        id: true,
        tipo: true,
        dataEvento: true,
        membroNome: true,
        nomeResponsavelRaw: true,
        enviarEm: true,
        mensagem: true,
      },
    });

    if (!pendingEscala) {
      return NextResponse.json({
        success: true,
        data: { processed: 0, success: 0, errors: 0 },
        message: "Nenhum envio pendente",
      });
    }

    // ✅ Claim atômico (anti-race)
    const claimedEscala = await prisma.escala.updateMany({
      where: { id: pendingEscala.id, status: "PENDENTE" },
      data: { status: "ENVIANDO" },
    });

    if (claimedEscala.count === 0) {
      return NextResponse.json({
        success: true,
        data: { processed: 0, success: 0, errors: 0 },
        message: "Outro worker já processou esta Escala",
      });
    }

    const responsavel =
      pendingEscala.membroNome ?? pendingEscala.nomeResponsavelRaw ?? "—";

    const dataEventoFmt = fmtDateInTZ(pendingEscala.dataEvento);
    const agendamento = pendingEscala.enviarEm;

    try {
      await sendScaleTriggerEmail(
        pendingEscala.tipo as any,
        responsavel,
        dataEventoFmt,
        null, // não existe mais "horario"
        agendamento,
        pendingEscala.mensagem ?? null
      );

      await prisma.escala.update({
        where: { id: pendingEscala.id },
        data: {
          status: "ENVIADO",
          dataEnvio: new Date(),
          erroMensagem: null,
        },
      });

      return NextResponse.json({
        success: true,
        data: { processed: 1, success: 1, errors: 0 },
        message: "Processado 1 envio (escala)",
      });
    } catch (err: any) {
      await prisma.escala.update({
        where: { id: pendingEscala.id },
        data: {
          status: "ERRO",
          erroMensagem: String(err?.message ?? err),
        },
      });

      return NextResponse.json({
        success: false,
        error: "Erro ao enviar escala",
        details: String(err?.message ?? err),
      });
    }
  } catch (err: any) {
    console.error("[emails/process] erro:", err);
    return NextResponse.json(
      { success: false, error: "Erro interno", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
