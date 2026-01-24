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

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }

    const escala = await prisma.escala.findUnique({ where: { id } });

    if (!escala) {
      return NextResponse.json({ ok: false, error: "Escala não encontrada" }, { status: 404 });
    }

    if (escala.status === "ENVIANDO") {
      return NextResponse.json(
        { ok: false, error: "Esta escala já está em envio" },
        { status: 409 }
      );
    }

    if (!escala.membroId) {
      return NextResponse.json(
        { ok: false, error: "Vincule a escala a um membro antes de enviar" },
        { status: 400 }
      );
    }

    const member = await prisma.member.findUnique({
      where: { id: escala.membroId },
      select: { id: true, nome: true, email: true, telefone: true },
    });

    if (!member) {
      return NextResponse.json({ ok: false, error: "Membro não encontrado" }, { status: 404 });
    }

    const now = new Date();

    await prisma.escala.update({
      where: { id: escala.id },
      data: { status: "ENVIANDO", erroMensagem: null },
    });

    const responsavelNome = escala.membroNome ?? escala.nomeResponsavelRaw ?? member.nome ?? "—";
    const dataEventoFmt = fmtDateInTZ(escala.dataEvento);
    const agendamentoISO = now.toISOString();

    const result = await sendScaleTriggerEmail({
      tipo: escala.tipo as any,
      memberName: member.nome,
      memberEmail: member.email ?? null,
      memberPhone: member.telefone ?? null,
      responsavelNome,
      dataEventoFmt,
      agendamento: agendamentoISO,
      mensagemOpcional: escala.mensagem ?? null,
    });

    if (!result.success) {
      throw new Error(result.message ?? "Falha ao enviar e-mail");
    }

    await prisma.escala.update({
      where: { id: escala.id },
      data: {
        status: "ENVIADO",
        dataEnvio: now,
        erroMensagem: null,
      },
    });

    return NextResponse.json({ ok: true, message: "Envio realizado agora." });
  } catch (err: any) {
    console.error("[escala/enviar-agora] erro:", err);

    const id = params?.id;
    if (id) {
      await prisma.escala
        .update({
          where: { id },
          data: {
            status: "ERRO",
            erroMensagem: String(err?.message ?? err),
          },
        })
        .catch(() => null);
    }

    return NextResponse.json(
      { ok: false, error: "Falha ao enviar agora", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
