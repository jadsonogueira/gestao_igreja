export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Resend } from "resend";

type SendEmailBody = {
  subject?: string;
  html?: string;

  // dados opcionais pra automação (pode mandar o que você quiser)
  membroId?: string;
  membroNome?: string;
  membroEmail?: string;
  grupo?: string;
};

export async function POST(req: Request) {
  try {
    const body: SendEmailBody = await req.json();

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM;
    const automationTo = process.env.AUTOMATION_EMAIL_TO;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "RESEND_API_KEY não configurada" },
        { status: 500 }
      );
    }

    if (!from) {
      return NextResponse.json(
        { success: false, error: "RESEND_FROM não configurado" },
        { status: 500 }
      );
    }

    if (!automationTo) {
      return NextResponse.json(
        { success: false, error: "AUTOMATION_EMAIL_TO não configurado" },
        { status: 500 }
      );
    }

    // subject/html mínimos
    const subject =
      body.subject ??
      `Automação - envio_email | grupo=${body.grupo ?? "N/A"} | membro=${body.membroNome ?? "N/A"} | id=${
        body.membroId ?? "N/A"
      }`;

    const html =
      body.html ??
      `
      <h3>Gatilho de Automação</h3>
      <p><b>Grupo:</b> ${body.grupo ?? "N/A"}</p>
      <p><b>Membro:</b> ${body.membroNome ?? "N/A"}</p>
      <p><b>Membro ID:</b> ${body.membroId ?? "N/A"}</p>
      <p><b>Email do membro:</b> ${body.membroEmail ?? "N/A"}</p>
    `;

    const resend = new Resend(apiKey);

    // ✅ DESTINO FIXO (Power Automate)
    const result = await resend.emails.send({
      from,
      to: automationTo,
      subject,
      html,
    });

    return NextResponse.json({
      success: true,
      message: "E-mail enviado para a automação (destino fixo)",
      to: automationTo,
      result,
    });
  } catch (error: any) {
    console.error("RESEND ERROR:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao enviar e-mail", detail: error?.message },
      { status: 500 }
    );
  }
}