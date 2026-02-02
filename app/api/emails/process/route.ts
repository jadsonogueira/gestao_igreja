export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { processEscalaEmail } from "@/lib/processEscalaEmail";
import { Resend } from "resend";

const FIXED_TO = "jadsonnogueira@msn.com";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Env var ausente: ${name}`);
  return v;
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
        const resend = new Resend(mustEnv("RESEND_API_KEY"));
        const from = mustEnv("RESEND_FROM");

        // Campos podem variar; usamos de forma defensiva
        const group = String((pendingEmail as any)?.grupo ?? (pendingEmail as any)?.group ?? "grupo");
        const nome = String((pendingEmail as any)?.membroNome ?? (pendingEmail as any)?.nome ?? "");
        const emailCadastro = String((pendingEmail as any)?.membroEmail ?? (pendingEmail as any)?.email ?? "");

        // Se existir algum campo de mensagem, usamos. Se não existir, mandamos um gatilho padrão.
        const msg =
          String(
            (pendingEmail as any)?.mensagem ??
              (pendingEmail as any)?.mensagemEnviada ??
              (pendingEmail as any)?.texto ??
              (pendingEmail as any)?.body ??
              ""
          ).trim() || "Disparo automático do sistema (gatilho Power Automate).";

        const subject = `[GESTAO_IGREJA] trigger | grupo=${group} | id=${pendingEmail.id}`;

        // Importante: mantém "Mensagem:" pra seus fluxos que fazem split("Mensagem:")
        const html = `
          <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.4;">
            <p><strong>Grupo:</strong> ${group}</p>
            <p><strong>Nome (cadastro):</strong> ${nome}</p>
            <p><strong>Email (cadastro):</strong> ${emailCadastro}</p>
            <hr/>
            <p><strong>Mensagem:</strong></p>
            <pre style="white-space: pre-wrap;">${msg}</pre>
          </div>
        `;

        const sendRes = await resend.emails.send({
          from,
          to: FIXED_TO, // ✅ sempre fixo
          subject,
          html,
        });

        // defensivo: se vier erro no retorno
        const maybeErr = (sendRes as any)?.error;
        if (maybeErr) throw new Error(String(maybeErr?.message ?? maybeErr));

        // ✅ só marca "enviado" depois de enviar de verdade
        await prisma.emailLog.update({
          where: { id: pendingEmail.id },
          data: { status: "enviado", dataEnvio: new Date() },
        });

        return NextResponse.json({
          success: true,
          data: { processed: 1, success: 1, errors: 0 },
          message: "Processado 1 envio (grupo)",
          to: FIXED_TO,
        });
      } catch (e: any) {
        // Se falhar, volta pra fila (não deixa preso em "enviando")
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