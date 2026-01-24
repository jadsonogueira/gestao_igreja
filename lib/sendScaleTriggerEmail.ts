import { sendEmail } from "@/lib/email"; // ajuste se seu helper tiver outro caminho
import prisma from "@/lib/db";

const AUTOMATION_EMAIL_TO = process.env.AUTOMATION_EMAIL_TO || "jadsonnogueira@msn.com";

function replaceAllCompat(s: string, search: string, replacement: string) {
  // compatível com targets antigos (sem String.replaceAll)
  return s.split(search).join(replacement);
}

function escapeHtml(s: string) {
  return replaceAllCompat(
    replaceAllCompat(
      replaceAllCompat(
        replaceAllCompat(
          replaceAllCompat(s, "&", "&amp;"),
          "<",
          "&lt;"
        ),
        ">",
        "&gt;"
      ),
      '"',
      "&quot;"
    ),
    "'",
    "&#039;"
  );
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
    (escala.member?.nome ?? null) ||
    "N/D";

  const subject = `ESCALA | ${escala.tipo} | ${formatDateTimeToronto(escala.dataEvento)}`;

  const bodyText = [
    `TIPO: ${escala.tipo}`,
    `DATA_EVENTO: ${escala.dataEvento.toISOString()}`,
    `RESPONSAVEL: ${responsavel}`,
    `MENSAGEM: ${escala.mensagem ?? ""}`,
    `ESCALA_ID: ${escala.id}`,
  ].join("\n");

  const bodyHtml = `
    <h2>Escala</h2>
    <ul>
      <li><b>T
