import { getRequiredEnv } from "@/lib/getRequiredEnv";
import { escapeHtml } from "@/lib/escapeHtml";

const escalaLabels: Record<string, string> = {
  DIRIGENTE: "Dirigente",
  LOUVOR: "Louvor",
  LOUVOR_ESPECIAL: "Louvor Especial",
  PREGACAO: "Pregação",
  TESTEMUNHO: "Testemunho",
  APOIO: "Apoio",
};

export type SendScaleTriggerEmailParams = {
  // etiqueta do tipo de escala
  tipo: keyof typeof escalaLabels;

  // dados do membro vinculado
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

    const escalaDoDia = `${label}: ${params.responsavelNome}`;

    // ✅ Mensagem: "Escala do dia: (data)\n<escala>\nMensagem:\n<opcional>"
    const mensagemFinal = params.mensagemOpcional?.trim()
      ? `Escala do dia: (${params.dataEventoFmt})\n${escalaDoDia}\nMensagem:\n${params.mensagemOpcional.trim()}`
      : `Escala do dia: (${params.dataEventoFmt})\n${escalaDoDia}`;

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
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const json = await response.json().catch(() => ({} as any));

    if (!response.ok) {
      return {
        success: false,
        message: json?.message ?? `Erro no Resend (${response.status})`,
      };
    }

    return { success: true, id: json?.id };
  } catch (err: any) {
    return { success: false, message: String(err?.message ?? err) };
  }
}
