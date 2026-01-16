export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { to, subject, html } = body;

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { success: false, error: "RESEND_API_KEY não configurada" },
        { status: 500 }
      );
    }

    if (!process.env.RESEND_FROM) {
      return NextResponse.json(
        { success: false, error: "RESEND_FROM não configurado" },
        { status: 500 }
      );
    }

    if (!to || !subject || !html) {
      return NextResponse.json(
        {
          success: false,
          error: "Campos obrigatórios: to, subject, html",
        },
        { status: 400 }
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const result = await resend.emails.send({
      from: process.env.RESEND_FROM, // Igreja ABL <rpa@ablchurch.ca>
      to,
      subject,
      html,
    });

    return NextResponse.json({
      success: true,
      message: "E-mail enviado com sucesso",
      result,
    });
  } catch (error: any) {
    console.error("RESEND ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Erro ao enviar e-mail",
        detail: error?.message,
      },
      { status: 500 }
    );
  }
}