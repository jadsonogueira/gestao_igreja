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

type ProcessEscalaOptions = {
  manual?: boolean;
  sendAt?: Date;
};

type ProcessEscalaResult = {
  ok: boolean;
  status: number;
  error?: string;
};

export async function processEscalaEmail(
  escalaId: string,
  options: ProcessEscalaOptions = {}
): Promise<ProcessEscalaResult> {
  const { manual = false, sendAt } = options;

  const escala = await prisma.escala.findUnique({ where: { id: escalaId } });

  if (!escala) {
    return { ok: false, status: 404, error: "Escala não encontrada" };
  }

  if (escala.status === "ENVIANDO") {
    return { ok: false, status: 409, error: "Esta escala já está em envio" };
  }

  if (!manual && !escala.envioAutomatico) {
    return {
      ok: false,
      status: 400,
      error: "Envio automático desativado para esta escala",
    };
  }

  if (!escala.membroId) {
    await prisma.escala.update({
      where: { id: escala.id },
      data: {
        status: "ERRO",
        erroMensagem: "Escala sem vínculo com membro (membroId vazio).",
      },
    });

    return {
      ok: false,
      status: 400,
      error: "Escala sem vínculo com membro",
    };
  }

  const member = await prisma.member.findUnique({
    where: { id: escala.membroId },
    select: { id: true, nome: true, email: true, telefone: true },
  });

  if (!member) {
    await prisma.escala.update({
      where: { id: escala.id },
      data: {
        status: "ERRO",
        erroMensagem: "Escala com membroId inválido (membro não encontrado).",
      },
    });

    return { ok: false, status: 404, error: "Membro não encontrado" };
  }

  const now = new Date();

  await prisma.escala.update({
    where: { id: escala.id },
    data: { status: "ENVIANDO", erroMensagem: null },
  });

  const responsavelNome = escala.membroNome ?? escala.nomeResponsavelRaw ?? member.nome ?? "—";
  const dataEventoFmt = fmtDateInTZ(escala.dataEvento);
  const agendamentoDate = sendAt ?? escala.enviarEm ?? now;

  try {
    const result = await sendScaleTriggerEmail({
      tipo: escala.tipo as any,
      memberName: member.nome,
      memberEmail: member.email ?? null,
      memberPhone: member.telefone ?? null,
      responsavelNome,
      dataEventoFmt,
      agendamento: agendamentoDate.toISOString(),
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

    return { ok: true, status: 200 };
  } catch (err: any) {
    await prisma.escala
      .update({
        where: { id: escala.id },
        data: {
          status: "ERRO",
          erroMensagem: String(err?.message ?? err),
        },
      })
      .catch(() => null);

    return {
      ok: false,
      status: 500,
      error: String(err?.message ?? err),
    };
  }
}
