export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { processEscalaEmail } from "@/lib/processEscalaEmail";
import { sendTriggerEmail } from "@/lib/email"; // <-- ajuste o caminho se o arquivo tiver outro nome

function formatAgendamento(d: Date | string | null | undefined) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("pt-BR");
}

export async function POST() {
  try {
    // 1) pega 1 item pendente da fila de EmailLog (grupos)
    const pendingEmail = await prisma.emailLog.findFirst({
      where: { status: "pendente" },
      orderBy: { createdAt: "asc" },
    });

    if (pendingEmail) {
      // trava simples
      await prisma.emailLog.update({
        where: { id: pendingEmail.id },
        data: { status: "enviando" },
      });

      try {
        const grupo = String((pendingEmail as any)?.grupo ?? "");

        // Busca o membro (pra pegar telefone + manter nome/email coerentes)
        const member = await prisma.member.findUnique({
          where: { id: (pendingEmail as any).membroId },
          select: { nome: true, email: true, telefone: true },
        });

        // Busca a mensagem padrão do grupo (e flyer, se houver)
        const groupData = await prisma.messageGroup.findFirst({
          where: { nomeGrupo: grupo as any },
          select: { mensagemPadrao: true, flyerUrl: true },
        });

        const memberName = String(member?.nome ?? (pendingEmail as any)?.membroNome ?? "");
        const memberEmail = String(member?.email ?? (pendingEmail as any)?.membroEmail ?? "");
        const memberPhone = String(member?.telefone ?? "");
        const agendamento = formatAgendamento((pendingEmail as any)?.dataAgendamento);
        const mensagem = String(groupData?.mensagemPadrao ?? "");
        const flyerUrl = groupData?.flyerUrl ?? null;

        // ✅ ENVIO REAL no modelo antigo
        const sendResult = await sendTriggerEmail(
          grupo as any,
          memberName,
          memberEmail,
          memberPhone,
          agendamento,
          mensagem,
          flyerUrl
        );

        if (!sendResult?.success) {
          throw new Error(sendResult?.message ?? "Falha ao enviar email");
        }

        // ✅ só marca enviado depois do envio OK
        await prisma.emailLog.update({
          where: { id: pendingEmail.id },
          data: { status: "enviado", dataEnvio: new Date() },
        });

        return NextResponse.json({
          success: true,
          data: { processed: 1, success: 1, errors: 0 },
          message: "Processado 1 envio (grupo)",
        });
      } catch (e: any) {
        // volta pra fila se falhar (não deixa preso em enviando)
        await prisma.emailLog.update({
          where: { id: pendingEmail.id },
          data: { status: "pendente" },
        });

        return NextResponse.json(
          { success: false, error: "Erro ao enviar (grupo)", details: String(e?.message ?? e) },
          { status: 502 }
        );
      }
    }

    // 2) se não tem EmailLog pendente, tenta Escala pendente
    const now = new Date();

    const pendingEscala = await prisma.escala.findFirst({
      where: {
        status: "PENDENTE",
        envioAutomatico: true,
        enviarEm: { lte: now },
      },
      orderBy: { enviarEm: "asc" },
    });

    if (!pendingEscala) {
      return NextResponse.json({
        success: true,
        data: { processed: 0, success: 0, errors: 0 },
        message: "Nenhum envio pendente",
      });
    }

    const result = await processEscalaEmail(pendingEscala.id, {
      manual: false,
      sendAt: pendingEscala.enviarEm,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: "Erro ao enviar escala", details: result.error },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { processed: 1, success: 1, errors: 0 },
      message: "Processado 1 envio (escala)",
    });
  } catch (err: any) {
    console.error("[emails/process] erro:", err);
    return NextResponse.json(
      { success: false, error: "Erro interno", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}