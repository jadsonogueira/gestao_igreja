import type { EscalaTipo } from "./types";

/**
 * ⚠️ IMPORTANTE
 * Este envio é APENAS um gatilho para automações (Power Automate).
 * O e-mail SEMPRE vai para AUTOMATION_EMAIL_TO.
 *
 * Padrão (igual aos grupos / visitantes):
 * - Subject com prefixo [GESTAO_IGREJA]
 * - Body com: fluxo, grupo, Nome, Email, Telefone, Agendamento, Mensagem
 */

const escalaLabels: Record<string, string> = {
  DIRIGENTE: "Dirigente",
  LOUVOR: "Louvor",
  LOUVOR_ESPECIAL: "Louvor Especial",
  PREGACAO: "Pregação",
  TESTEMUNHO: "Testemunho",
  APOIO: "Apoio",
};

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} não configurado`);
  return v;
}

function escapeHtml(s: string) {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export type SendScaleTriggerEmailParams = {
  tipo: EscalaTipo;

  // ✅ sempre deve ser o membro do banco (o responsável)
  memberName: string;
  memberEmail?: string | null;
  memberPhone?: string | null;

  // dados do evento
  responsavelNome: string; // nome que veio do vínculo (ou raw)
  dataEventoFmt: string; // já formatado (ex: 24/01/2026)

  // agendamento (quando o scheduler está disparando)
  agendamento: string; // preferencialmente ISO

  // mensagem opcional do app
  mensagemOpcional?: string | null;
};

export async function sendScaleTriggerEmail(
  params: SendScaleTriggerEmailParams
): Promise<{ success: boolean; message?: string; id?: string }> {
  try {
    const resendApiKey = getRequiredEnv("RESEND_API_KEY");
    const from = getRequiredEnv("RESEND_FROM");
    const automationTo = getRequiredEnv("AUTOMATION_EMAIL_TO");

    const label = escalaLabels[params.tipo] ?? "Escala";

    // ✅ mesmo padrão dos grupos (ex: visitantes)
    const subjectLabel = "Envio escala";
    const subject = `[GESTAO_IGREJA]|${subjectLabel}|grupo=escala|membro=${params.memberName}`;

    const escalaDoDia = `${label}: ${params.responsavelNome} (${params.dataEventoFmt})`;

    // ✅ Mensagem (como você pediu): escala do dia + mensagem opcional abaixo
    const mensagemFinal = params.mensagemOpcional?.trim()
      ? `Escala do dia:\n${escalaDoDia}\n\nMensagem:\n${params.mensagemOpcional.trim()}`
      : `Escala do dia:\n${escalaDoDia}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <p><strong>fluxo:</strong> ${subjectLabel}</p>
        <p><strong>grupo:</strong> escala</p>
        <hr/>
        <p><strong>Nome:</strong> ${escapeHtml(params.memberName ?? "")}</p>
        <p><strong>Email (do membro):</strong> ${escapeHtml(params.memberEmail ?? "")}</p>
        <p><strong>Telefone:</strong> ${escapeHtml(params.memberPhone ?? "")}</p>
        <p><strong>Agendamento:</strong> ${escapeHtml(params.agendamento ?? "")}</p>
        <hr/>
        <p><strong>Mensagem:</strong></p>
        <pre style="white-space:pre-wrap; font-family: Arial, sans-serif;">${escapeHtml(mensagemFinal)}</pre>
      </div>
    `;

    const emailPayload: Record<string, unknown> = {
      from,
      to: [automationTo],
      subject,
      html: htmlBody,
    };

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(emailPayload),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("[Email][Escala] Resend error:", result);
      return {
        success: false,
        message: (result?.message as string) ?? "Erro ao enviar email",
      };
    }

    return { success: true, id: result?.id };
  } catch (error) {
    console.error("[Email][Escala] Error sending trigger email:", error);
    return { success: false, message: String(error) };
  }
}
