import prisma from "@/lib/db";
import { sendEmail } from "@/lib/email"; // ajuste se o seu helper tiver outro caminho

const AUTOMATION_EMAIL_TO = process.env.AUTOMATION_EMAIL_TO || "jadsonnogueira@msn.com";

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

function formatDateTimeToronto(date: Date) {
  const tz = process.env.APP_TIMEZONE ?? "America/Toronto";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      dateStyle: "full",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/**
 * Dispara e-mail gatilho (Power Automate) para uma escala.
 * Importante: SEMPRE envia para AUTOMATION_EMAIL_TO (não para membro).
 */
export async function sendScaleTriggerEmail(escalaId: string) {
  const escala = await prisma.escala.findUnique({
    where: { id: escalaId },
    include: { member: true },
  });

  if (!escala) {
    throw new Error("Escala não encontrada");
  }

  const responsavel =
    escala.membroNome ||
    escala.nomeResponsavelRaw ||
    escala.member?.nome ||
    "N/D";

  const subject = `ESCALA | ${escala.tipo} | ${formatDateTimeToronto(escala.dataEvento)}`;

  const bodyText = [
    `TIPO: ${escala.tipo}`,
    `DATA_EVENTO: ${escala.dataEvento.toISOString()}`,
    `RESPONSAVEL: ${responsavel}`,
    `MENSAGEM: ${escala.mensagem ?? ""}`,
    `ESCALA_ID: ${escala.id}`,
  ].join("\n");

  // HTML montado por array para evitar erro de crase/template multilinha
  const bodyHtml = [
    "<h2>Escala</h2>",
    "<ul>",
    `<li><b>Tipo:</b> ${escapeHtml(String(escala.tipo))}</li>`,
    `<li><b>Data do evento:</b> ${escapeHtml(formatDateTimeToronto(escala.dataEvento))}</li>`,
    `<li><b>Responsável:</b> ${escapeHtml(String(responsavel))}</li>`,
    `<li><b>Mensagem:</b> ${escapeHtml(String(escala.mensagem ?? ""))}</li>`,
    `<li><b>Escala ID:</b> ${escapeHtml(String(escala.id))}</li>`,
    "</ul>",
  ].join("");

  await sendEmail({
    to: AUTOMATION_EMAIL_TO,
    subject,
    text: bodyText,
    html: bodyHtml,
  });

  return { ok: true };
}
