export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendScaleTriggerEmail, sendTriggerEmail } from "@/lib/email-service";
import type { GroupType } from "@/lib/types";

export async function POST() {
  try {
    const now = new Date();

    // 1) Próximo EmailLog pendente (fila tradicional)
    const pendingEmail = await prisma.emailLog.findFirst({
      where: { status: "pendente" },
      orderBy: { dataAgendamento: "asc" },
    });

    // 2) Próximo item de Escala pendente (envio automático) que já venceu
    const pendingEscala = await prisma.escala.findFirst({
      where: { status: "PENDENTE", envioAutomatico: true, enviarEm: { lte: now } },
      orderBy: { enviarEm: "asc" },
    });

    // Se não tem nada em nenhuma fila
    if (!pendingEmail && !pendingEscala) {
      return NextResponse.json({
        success: true,
        data: { processed: 0, success: 0, errors: 0 },
        message: "Nenhum envio pendente",
      });
    }

    // Decide qual processar primeiro: o que tiver o agendamento mais antigo
    const emailWhen = pendingEmail?.dataAgendamento ? new Date(pendingEmail.dataAgendamento) : null;
    const escalaWhen = pendingEscala?.enviarEm ? new Date(pendingEscala.enviarEm) : null;

    const processEscalaFirst =
      !!pendingEscala &&
      (!pendingEmail || (escalaWhen && emailWhen && escalaWhen <= emailWhen));

    if (processEscalaFirst) {
      // =========================
      // PROCESSA ESCALA (1 por tick)
      // =========================
      await prisma.escala.update({
        where: { id: pendingEscala!.id },
        data: { status: "ENVIANDO" },
      });

      const agendamento = now.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const dataEventoFmt = new Date(pendingEscala!.dataEvento).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      const result = await sendScaleTriggerEmail(
        pendingEscala!.tipo as any,
        pendingEscala!.nomeResponsavel,
        dataEventoFmt,
        pendingEscala!.horario ?? null,
        agendamento,
        pendingEscala!.mensagem ?? null
      );

      if (result.success) {
        await prisma.escala.update({
          where: { id: pendingEscala!.id },
          data: { status: "ENVIADO", dataEnvio: now },
        });

        return NextResponse.json({
          success: true,
          data: { processed: 1, success: 1, errors: 0, kind: "escala" },
        });
      }

      await prisma.escala.update({
        where: { id: pendingEscala!.id },
        data: { status: "ERRO", erroMensagem: result.message ?? "Erro desconhecido" },
      });

      return NextResponse.json({
        success: true,
        data: { processed: 1, success: 0, errors: 1, kind: "escala" },
      });
    }

    // =========================
    // PROCESSA EMAILLOG (1 por tick)
    // =========================

    // ✅ Aqui o TS ainda acha que pendingEmail pode ser null.
    // Então fazemos um guard explícito:
    if (!pendingEmail) {
      // Teoricamente impossível, mas mantém o TS feliz.
      return NextResponse.json({
        success: true,
        data: { processed: 0, success: 0, errors: 0 },
        message: "Nenhum email pendente",
      });
    }

    // A partir daqui: TS sabe que não é null
    const email = pendingEmail;

    // Mark as sending
    await prisma.emailLog.update({
      where: { id: email.id },
      data: { status: "enviando" },
    });

    // Get group config and member
    const [group, member] = await Promise.all([
      prisma.messageGroup.findFirst({ where: { nomeGrupo: email.grupo } }),
      prisma.member.findUnique({ where: { id: email.membroId } }),
    ]);

    if (!member) {
      await prisma.emailLog.update({
        where: { id: email.id },
        data: { status: "erro", erroMensagem: "Membro não encontrado" },
      });

      return NextResponse.json({
        success: true,
        data: { processed: 1, success: 0, errors: 1, kind: "email" },
      });
    }

    // Format date
    const agendamento = now.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // valida destino fixo configurado
    const automationTo = process.env.AUTOMATION_EMAIL_TO;

    if (!automationTo) {
      await prisma.emailLog.update({
        where: { id: email.id },
        data: { status: "erro", erroMensagem: "AUTOMATION_EMAIL_TO não configurado" },
      });

      return NextResponse.json(
        { success: false, error: "AUTOMATION_EMAIL_TO não configurado" },
        { status: 500 }
      );
    }

    const result = await sendTriggerEmail(
      email.grupo as GroupType,
      member.nome ?? "",
      member.email ?? "",
      member.telefone ?? "",
      agendamento,
      group?.mensagemPadrao ?? "",
      group?.flyerUrl
    );

    if (result.success) {
      const updates: Promise<any>[] = [];

      // 1) marca email log como enviado
      updates.push(
        prisma.emailLog.update({
          where: { id: email.id },
          data: {
            status: "enviado",
            dataEnvio: now,
            mensagemEnviada: group?.mensagemPadrao ?? "",
          },
        })
      );

      // 2) encerra "fila" do membro conforme o grupo enviado
      if (email.grupo === "visitantes") {
        updates.push(
          prisma.member.update({
            where: { id: member.id },
            data: { grupoVisitantes: false },
          })
        );
      }

      if (email.grupo === "convite") {
        updates.push(
          prisma.member.update({
            where: { id: member.id },
            data: { grupoConvite: false },
          })
        );
      }

      await Promise.all(updates);

      return NextResponse.json({
        success: true,
        data: { processed: 1, success: 1, errors: 0, kind: "email" },
      });
    }

    await prisma.emailLog.update({
      where: { id: email.id },
      data: { status: "erro", erroMensagem: result.message ?? "Erro desconhecido" },
    });

    return NextResponse.json({
      success: true,
      data: { processed: 1, success: 0, errors: 1, kind: "email" },
    });
  } catch (error) {
    console.error("Error processing email:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao processar email" },
      { status: 500 }
    );
  }
}