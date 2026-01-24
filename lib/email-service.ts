import { Resend } from "resend";

type EscalaTipo =
  | "DIRIGENTE"
  | "LOUVOR"
  | "LOUVOR_ESPECIAL"
  | "PREGACAO"
  | "TESTEMUNHO"
  | "APOIO";

function tipoLabel(tipo: EscalaTipo) {
  switch (tipo) {
    case "DIRIGENTE":
      return "Dirigente";
    case "LOUVOR":
      return "Louvor";
    case "LOUVOR_ESPECIAL":
      return "Louvor Especial";
    case "PREGACAO":
      return "Pregação";
    case "TESTEMUNHO":
      return "Testemunho";
    case "APOIO":
      return "Apoio";
    default:
      return String(tipo);
  }
}

// compatível com targets antigos (sem String.replaceAll)
function replaceAllCompat(s: string, search: string, replacement: string) {
  return s.split(search).join(replacement);
}

function escapeHtml(s: string) {
  let out = String(s ?? "");
  out = replaceAllCompat(out, "&", "&amp;");
  out = replaceAllCompat(out, "<", "&lt;");
  out = replaceAllCompat(out, ">", "&gt;");
  out = replaceAllCompat(out, '"', "&quot;");
  out = replaceAllCompat(out, "'", "&#039;");
  return out;
}

/**
 * Envia e-mail gatilho (Power Automate) para a ESCALA.
 * ⚠️ Destino SEMPRE fixo: AUTOMATION_EMAIL_TO (fallback: jadsonnogueira@msn.com)
 *
 * Assinatura mantida (para não quebrar app/api/emails/process/route.ts)
 */
export async function sendScaleTriggerEmail(
  tipo: EscalaTipo,
  responsavel: string,
  dataEventoFmt: string,
  horario: string | null,
  enviarEm: Date,
  mensagemOpcional: string | null
) {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.RESEND_FROM ?? "Igreja ABL <rpa@ablchurch.ca>";

  if (!apiKey) {
    throw new Error("RESEND_API_KEY não configurado");
  }

  // ✅ destino fixo
  const to = process.env.AUTOMATION_EMAIL_TO ?? "jadsonnogueira@msn.com";

  const tipoText = tipoLabel(tipo);

  // Assunto padronizado para facilitar filtros no Power Automate
  const subject = `ESCALA | ${tipoText} | ${dataEventoFmt}`;

  const msgTrim = mensagemOpcional?.trim() ? mensagemOpcional.trim() : null;
  const safeMsg = msgTrim ? escapeHtml(msgTrim) : null;

  const textLines = [
    `Tipo: ${tipoText}`,
    `Data: ${dataEventoFmt}`,
    horario ? `Horário: ${horario}` : null,
    `Responsável: ${responsavel}`,
    `Enviar em: ${enviarEm.toISOString()}`,
    msgTrim ? `Mensagem: ${msgTrim}` : null,
  ].filter(Boolean) as string[];

  // HTML por array (evita "Unexpected eof" por crase/template cortado)
  const horarioRow = horario
    ? [
        "<tr>",
        '<td style="border: 1px solid #eee"><b>Horário</b></td>',
        `<td style="border: 1px solid #eee">${escapeHtml(horario)}</td>`,
        "</tr>",
      ].join("")
    : "";

  const msgBlock = safeMsg
    ? [
        '<div style="margin-top: 14px; padding: 12px; border: 1px solid #eee; border-radius: 8px">',
        "<b>Mensagem (opcional):</b><br/>",
        `<div style="margin-top: 6px; white-space: pre-wrap">${safeMsg}</div>`,
        "</div>",
      ].join("")
    : "";

  const html = [
    '<div style="font-family: Arial, sans-serif; line-height: 1.5">',
    '<h2 style="margin: 0 0 12px">Escala do Culto</h2>',
    '<table cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 640px">',
    "<tr>",
    '<td style="border: 1px solid #eee; width: 180px"><b>Tipo</b></td>',
    `<td style="border: 1px solid #eee">${escapeHtml(tipoText)}</td>`,
    "</tr>",
    "<tr>",
    '<td style="border: 1px solid #eee"><b>Data</b></td>',
    `<td style="border: 1px solid #eee">${escapeHtml(dataEventoFmt)}</td>`,
    "</tr>",
    horarioRow,
    "<tr>",
    '<td style="border: 1px solid #eee"><b>Responsável</b></td>',
    `<td style="border: 1px solid #eee">${escapeHtml(responsavel)}</td>`,
    "</tr>",
    "<tr>",
    '<td style="border: 1px solid #eee"><b>Enviar em</b></td>',
    `<td style="border: 1px solid #eee">${escapeHtml(enviarEm.toISOString())}</td>`,
    "</tr>",
    "</table>",
    msgBlock,
    '<p style="margin-top: 16px; color: #666; font-size: 12px">(Este e-mail é um gatilho para automação. Não responder.)</p>',
    "</div>",
  ].join("");

  const resend = new Resend(apiKey);

  const result = await resend.emails.send({
    from,
    to,
    subject,
    text: textLines.join("\n"),
    html,
  });

  if ((result as any)?.error) {
    throw new Error((result as any).error?.message ?? "Falha ao enviar via Resend");
  }

  return result;
}
