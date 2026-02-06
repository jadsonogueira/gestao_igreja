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

  // ❗ Sem membroId não tem como enviar e nem como gravar EmailLog (membroId é obrigatório)
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

  // ❗ Se o membro não existe, também não gravamos EmailLog porque a relação exige Member válido
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

  const responsavelNome =
    escala.membroNome ?? escala.nomeResponsavelRaw ?? member.nome ?? "—";

  const dataEventoFmt = fmtDateUTC(escala.dataEvento);

  const agendamentoDate = sendAt ?? escala.enviarEm ?? now;

  // ✅ Grupo do histórico (você pode filtrar depois no menu Histórico)
  const grupoHistorico = `ESCALA_${String(escala.tipo)}${manual ? "_MANUAL" : ""}`;

  // ✅ conteúdo padrão pra guardar no histórico
  const mensagemHistorico =
    escala.mensagem?.trim() ||
    `Escala ${String(escala.tipo)} - ${responsavelNome} - ${dataEventoFmt}`;

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

    // ✅ HISTÓRICO (EmailLog) — NÃO PODE derrubar a request se falhar
    try {
      await prisma.emailLog.create({
        data: {
          grupo: grupoHistorico,
          membroId: member.id,
          membroNome: member.nome,
          membroEmail: member.email ?? null,

          // ✅ manter padronizado com o resto do app
          status: "enviado",

          dataAgendamento: agendamentoDate,
          dataEnvio: now,

          mensagemEnviada: mensagemHistorico,
          erroMensagem: null,
        },
      });
    } catch (e) {
      console.error("[Escala][EmailLog] Falha ao gravar histórico (enviado):", e);
      // não derruba
    }

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

    // ✅ HISTÓRICO (EmailLog) - ERRO — também não pode derrubar
    try {
      await prisma.emailLog.create({
        data: {
          grupo: grupoHistorico,
          membroId: member.id,
          membroNome: member.nome,
          membroEmail: member.email ?? null,

          status: "erro",

          dataAgendamento: agendamentoDate,
          dataEnvio: null,

          mensagemEnviada: mensagemHistorico,
          erroMensagem: msg,
        },
      });
    } catch (e) {
      console.error("[Escala][EmailLog] Falha ao gravar histórico (erro):", e);
      // não derruba
    }

    return {
      ok: false,
      status: 500,
      error: msg,
    };
  }
}