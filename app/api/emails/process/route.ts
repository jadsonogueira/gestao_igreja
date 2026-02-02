export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { processEscalaEmail } from "@/lib/processEscalaEmail";

// Labels dos grupos para o assunto do email (igual ao antigo)
const groupSubjectLabels: Record<string, string> = {
  aniversario: "Envio aniversário",
  pastoral: "Envio pastoral",
  devocional: "Envio devocional",
  visitantes: "Envio visitante",
  membros_sumidos: "Envio sumido",
};

// Labels dos grupos para o corpo do email (igual ao antigo)
const groupFlowLabels: Record<string, string> = {
  aniversario: "Envio aniversário",
  pastoral: "Envio pastoral",
  devocional: "Envio devocional",
  visitantes: "Envio visitante",
  membros_sumidos: "Envio sumido",
};

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} não configurado`);
  return v;
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function formatAgendamento(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR");
}

// baixar imagem (http/https) e converter em base64 para anexar
async function downloadImageAsBase64(
  url: string
): Promise<{ content: string; filename: string; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    const contentType = res.headers.get("content-type") ?? "image/png";
    const filename = "panfleto." + (contentType.split("/")[1] ?? "png");

    return { content: base64, filename, contentType };
  } catch {
    return null;
  }
}

async function sendTriggerEmailLikeOldModel(params: {
  grupo: string;
  memberName: string;
  memberEmail: string;
  memberPhone: string;
  agendamento: string;
  mensagem: string;
  flyerUrl?: string | null;
}): Promise<{ success: boolean; message?: string; id?: string }> {
  const resendApiKey = getRequiredEnv("RESEND_API_KEY");
  const from = getRequiredEnv("RESEND_FROM");
  const automationTo = getRequiredEnv("AUTOMATION_EMAIL_TO");

  const subjectLabel = groupSubjectLabels[params.grupo] ?? "Envio igreja";
  const fluxo = groupFlowLabels[params.grupo] ?? "Envio igreja";

  const subject = `[GESTAO_IGREJA]|${subjectLabel}|grupo=${params.grupo}|membro=${params.memberName}`;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <p><strong>fluxo:</strong> ${fluxo}</p>
      <p><strong>grupo:</strong> ${params.grupo}</p>
      <hr/>
      <p><strong>Nome:</strong> ${params.memberName ?? ""}</p>
      <p><strong>Email (do membro):</strong> ${params.memberEmail ?? ""}</p>
      <p><strong>Telefone:</strong> ${params.memberPhone ?? ""}</p>
      <p><strong>Agendamento:</strong> ${params.agendamento ?? ""}</p>
      <hr/>
      <p><strong>Mensagem:</strong></p>
      <pre style="white-space:pre-wrap; font-family: Arial, sans-serif;">${params.mensagem ?? ""}</pre>
      ${params.flyerUrl ? '<p><em>📎 Panfleto anexado a este email</em></p>' : ""}
    </div>
  `;

  const emailPayload: Record<string, unknown> = {
    from,
    to: [automationTo], // ✅ SEMPRE destino fixo
    subject,
    html: htmlBody,
  };

  // ✅ Anexo só se for URL http(s) (para não quebrar deploy com S3/path)
  if (params.flyerUrl && looksLikeUrl(params.flyerUrl)) {
    const imageData = await downloadImageAsBase64(params.flyerUrl);
    if (imageData) {
      emailPayload.attachments = [
        {
          filename: imageData.filename,
          content: imageData.content,
          content_type: imageData.contentType,
        },
      ];
    }
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify(emailPayload),
  });

  const result = await response.json();

  if (!response.ok) {
    return {
      success: false,
      message: (result?.message as string) ?? "Erro ao enviar email",
    };
  }

  return { success: true, id: result?.id };
}

export async function POST() {
  try {
    // 1) pega 1 item pendente da fila de EmailLog (grupos)
    const pendingEmail = await prisma.emailLog.findFirst({
      where: { status: "pendente" },
      orderBy: { createdAt: "asc" },
    });

    if (pendingEmail) {
      await prisma.emailLog.update({
        where: { id: pendingEmail.id },
        data: { status: "enviando" },
      });

      try {
        const grupo = String((pendingEmail as any)?.grupo ?? "");

        // pega telefone do membro (o EmailLog não grava telefone)
        const member = await prisma.member.findUnique({
          where: { id: (pendingEmail as any).membroId },
          select: { nome: true, email: true, telefone: true },
        });

        // pega mensagemPadrao do grupo (e flyerUrl)
        const mg = await prisma.messageGroup.findFirst({
          where: { nomeGrupo: grupo as any },
          select: { mensagemPadrao: true, flyerUrl: true },
        });

        const memberName = String(member?.nome ?? (pendingEmail as any)?.membroNome ?? "");
        const memberEmail = String(member?.email ?? (pendingEmail as any)?.membroEmail ?? "");
        const memberPhone = String(member?.telefone ?? "");
        const agendamento = formatAgendamento((pendingEmail as any)?.dataAgendamento);
        const mensagem = String(mg?.mensagemPadrao ?? "");
        const flyerUrl = mg?.flyerUrl ?? null;

        const sendRes = await sendTriggerEmailLikeOldModel({
          grupo,
          memberName,
          memberEmail,
          memberPhone,
          agendamento,
          mensagem,
          flyerUrl,
        });

        if (!sendRes.success) {
          throw new Error(sendRes.message ?? "Falha ao enviar email");
        }

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
        // volta pra fila (não deixa preso em enviando)
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