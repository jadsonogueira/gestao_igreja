import prisma from "@/lib/db";
import { sendScaleTriggerEmail } from "@/lib/sendScaleTriggerEmail";

// ✅ Para "data do evento" (all-day) não pode usar TZ do Canadá,
// porque dataEvento está salvo como 00:00Z e vira "dia anterior" em Toronto.
// Então formatamos pelo UTC (dia/mês/ano do próprio registro).
function fmtDateUTC(d: Date) {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = String(d.getUTCFullYear());
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

    // ✅ registra no histórico (ERRO)
    await prisma.emailLog
      .create({
        data: {
          // ajuste esses campos se seu model tiver nomes diferentes
          type: "ESCALA",
          status: "ERRO",
          membroId: null,
          membroNome: escala.membroNome ?? escala.nomeResponsavelRaw ?? "—",
          subject: `Escala (${escala.tipo}) - falha (sem membro vinculado)`,
          to: null,
          errorMessage: "Escala sem vínculo com membro (membroId vazio).",
          meta: {
            escalaId: escala.id,
            escalaTipo: escala.tipo,
            dataEvento: escala.dataEvento?.toISOString?.() ?? String(escala.dataEvento),
            manual,
          },
        } as any,
      })
      .catch(() => null);

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

    // ✅ registra no histórico (ERRO)
    await prisma.emailLog
      .create({
        data: {
          type: "ESCALA",
          status: "ERRO",
          membroId: escala.membroId,
          membroNome: escala.membroNome ?? escala.nomeResponsavelRaw ?? "—",
          subject: `Escala (${escala.tipo}) - falha (membro não encontrado)`,
          to: null,
          errorMessage: "Escala com membroId inválido (membro não encontrado).",
          meta: {
            escalaId: escala.id,
            escalaTipo: escala.tipo,
            dataEvento: escala.dataEvento?.toISOString?.() ?? String(escala.dataEvento),
            manual,
          },
        } as any,
      })
      .catch(() => null);

    return { ok: false, status: 404, error: "Membro não encontrado" };
  }

  const now = new Date();

  await prisma.escala.update({
    where: { id: escala.id },
    data: { status: "ENVIANDO", erroMensagem: null },
  });

  const responsavelNome =
    escala.membroNome ?? escala.nomeResponsavelRaw ?? member.nome ?? "—";

  // ✅ data do evento precisa ser "o dia do registro", não o dia em Toronto
  const dataEventoFmt = fmtDateUTC(escala.dataEvento);

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

    // ✅ marca como enviado
    await prisma.escala.update({
      where: { id: escala.id },
      data: {
        status: "ENVIADO",
        dataEnvio: now,
        erroMensagem: null,
      },
    });

    // ✅ registra no histórico (SUCESSO)
    await prisma.emailLog
      .create({
        data: {
          type: "ESCALA",
          status: "ENVIADO",
          membroId: member.id,
          membroNome: member.nome,
          subject: `Escala (${escala.tipo}) - ${responsavelNome} - ${dataEventoFmt}`,
          to: member.email ?? null,
          errorMessage: null,
          meta: {
            escalaId: escala.id,
            escalaTipo: escala.tipo,
            dataEvento: escala.dataEvento?.toISOString?.() ?? String(escala.dataEvento),
            enviarEm: escala.enviarEm?.toISOString?.() ?? String(escala.enviarEm),
            enviadoEm: now.toISOString(),
            manual,
            agendamento: agendamentoDate.toISOString(),
          },
        } as any,
      })
      .catch(() => null);

    return { ok: true, status: 200 };
  } catch (err: any) {
    const msg = String(err?.message ?? err);

    await prisma.escala
      .update({
        where: { id: escala.id },
        data: {
          status: "ERRO",
          erroMensagem: msg,
        },
      })
      .catch(() => null);

    // ✅ registra no histórico (ERRO)
    await prisma.emailLog
      .create({
        data: {
          type: "ESCALA",
          status: "ERRO",
          membroId: member.id,
          membroNome: member.nome,
          subject: `Escala (${escala.tipo}) - falha`,
          to: member.email ?? null,
          errorMessage: msg,
          meta: {
            escalaId: escala.id,
            escalaTipo: escala.tipo,
            dataEvento: escala.dataEvento?.toISOString?.() ?? String(escala.dataEvento),
            enviarEm: escala.enviarEm?.toISOString?.() ?? String(escala.enviarEm),
            manual,
          },
        } as any,
      })
      .catch(() => null);

    return {
      ok: false,
      status: 500,
      error: msg,
    };
  }
}