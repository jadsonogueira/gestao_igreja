import type { EscalaTipo } from "./types";

/**
 * Gatilho para Power Automate.
 * SEMPRE envia para AUTOMATION_EMAIL_TO.
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

  // membro vinculado (do banco)
  memberName: string;
  memberEmail?: string | null;
  memberPhone?: string | null;

  // dados da escala
  responsavelNome: string;

  // ✅ já vem pronto como DD/MM/AAAA (do próprio evento)
  dataEventoFmt: string;

  // quando disparou
  agendamento: string;

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

    // padrão semelhante aos grupos
    const subjectLabel = "Envio escala";
    const subject = `[GESTAO_IGREJA]|${subjectLabel}|grupo=escala|membro=${params.memberName}`;

    // ✅ formato EXATO que você pediu
    // - "Escala do dia: (data do evento)"
    // - "Louvor: Nome" (sem data no fim)
    // - Mensagem: + 1 quebra de linha apenas
    const base = `Escala do dia: ${params.dataEventoFmt}\n${label}: ${params.responsavelNome}`;

    const mensagemFinal = params.mensagemOpcional?.trim()
      ? `${base}\nMensagem:\n${params.mensagemOpcional.trim()}`
      : base;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <p><strong>fluxo:</strong> ${escapeHtml(subjectLabel)}</p>
        <p><strong>grupo:</strong> escala</p>
        <hr/>
        <p><strong>Nome:</strong> ${escapeHtml(params.memberName ?? "")}</p>
        <p><strong>Email (do membro):</strong> ${escapeHtml(params.memberEmail ?? "")}</p>
        <p><strong>Telefone:</strong> ${escapeHtml(params.memberPhone ?? "")}</p>
        <p><strong>Agendamento:</strong> ${escapeHtml(params.agendamento ?? "")}</p>
        <hr/>
        <p><strong>Mensagem:</strong></p>
        <pre style="white-space:pre-wrap; font-family: Arial, sans-serif;">${escapeHtml(
          mensagemFinal
        )}</pre>
      </div>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [automationTo],
        subject,
        html: htmlBody,
      }),
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
    console.error("[Email][Escala] Error:", error);
    return { success: false, message: String(error) };
  }
}
