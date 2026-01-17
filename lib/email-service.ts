import type { GroupType } from "./types";
import * as path from "path";
import { getFileUrl } from "./s3";

// Labels dos grupos para o assunto do email
const groupSubjectLabels: Record<string, string> = {
  aniversario: "Envio aniversário",
  pastoral: "Envio pastoral",
  devocional: "Envio devocional",
  visitantes: "Envio visitante",
  membros_sumidos: "Envio sumido",
};

// Labels dos grupos para o corpo do email
const groupFlowLabels: Record<string, string> = {
  aniversario: "Envio aniversário",
  pastoral: "Envio pastoral",
  devocional: "Envio devocional",
  visitantes: "Envio visitante",
  membros_sumidos: "Envio sumido",
};

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} não configurado`);
  }
  return v;
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function extractFilename(value: string) {
  // value pode ser URL completa OU uma key do bucket (cloud_storage_path)
  try {
    if (looksLikeUrl(value)) {
      const urlPath = new URL(value).pathname;
      return path.basename(urlPath) || "panfleto.png";
    }
  } catch {
    // ignore
  }

  const base = path.basename(value);
  if (!base) return "panfleto.png";
  return base.includes(".") ? base : `${base}.png`;
}

async function resolveFlyerUrl(
  flyerUrl: string
): Promise<{ url: string; filename: string } | null> {
  if (!flyerUrl) return null;

  // Se já veio como URL, usa direto
  if (looksLikeUrl(flyerUrl)) {
    return { url: flyerUrl, filename: extractFilename(flyerUrl) };
  }

  // Se veio como "cloud_storage_path" (key), gera URL
  // Regra: se o caminho contém "public/" => URL pública, senão => URL assinada
  const isPublic = /(^|\/)public\//.test(flyerUrl) || /public\/uploads\//.test(flyerUrl);
  const url = await getFileUrl(flyerUrl, isPublic);
  return { url, filename: extractFilename(flyerUrl) };
}

export async function sendTriggerEmail(
  grupo: GroupType,
  memberName: string,
  memberEmail: string,
  memberPhone: string,
  agendamento: string,
  mensagem: string,
  flyerUrl?: string | null
): Promise<{ success: boolean; message?: string; id?: string }> {
  try {
    const resendApiKey = getRequiredEnv("RESEND_API_KEY");
    const from = getRequiredEnv("RESEND_FROM");
    const automationTo = getRequiredEnv("AUTOMATION_EMAIL_TO");

    const subjectLabel = groupSubjectLabels[grupo] ?? "Envio igreja";
    const fluxo = groupFlowLabels[grupo] ?? "Envio igreja";

    // ✅ Subject pensado para o Power Automate
    const subject = `[GESTAO_IGREJA]|${subjectLabel}|grupo=${grupo}|membro=${memberName}`;

    // ✅ HTML com dados do membro (mas SEMPRE envia para o destino fixo)
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <p><strong>fluxo:</strong> ${fluxo}</p>
        <p><strong>grupo:</strong> ${grupo}</p>
        <hr/>
        <p><strong>Nome:</strong> ${memberName ?? ""}</p>
        <p><strong>Email (do membro):</strong> ${memberEmail ?? ""}</p>
        <p><strong>Telefone:</strong> ${memberPhone ?? ""}</p>
        <p><strong>Agendamento:</strong> ${agendamento ?? ""}</p>
        <hr/>
        <p><strong>Mensagem:</strong></p>
        <pre style="white-space:pre-wrap; font-family: Arial, sans-serif;">${
          mensagem ?? ""
        }</pre>
        ${
          flyerUrl
            ? '<p><em>📎 Panfleto anexado a este email</em></p>'
            : ""
        }
      </div>
    `;

    // ✅ Anexo via URL (path) — Resend baixa e anexa
    const attachments: Array<{ filename: string; path: string }> = [];

    if (flyerUrl) {
      const resolved = await resolveFlyerUrl(flyerUrl);
      if (resolved?.url) {
        attachments.push({ filename: resolved.filename, path: resolved.url });
        console.log("[Email] Anexo adicionado via URL:", resolved.filename);
      } else {
        console.warn("[Email] Não foi possível resolver flyerUrl:", flyerUrl);
      }
    }

    const emailPayload: Record<string, unknown> = {
      from,
      to: [automationTo], // ✅ SEMPRE destino fixo
      subject,
      html: htmlBody,
    };

    if (attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    console.log(
      "[Email] Enviando para (destino fixo):",
      automationTo,
      "| from:",
      from,
      "| anexos:",
      attachments.length
    );

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(emailPayload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[Email] Resend error:", result);
      return {
        success: false,
        message: (result?.message as string) ?? "Erro ao enviar email",
      };
    }

    console.log("[Email] Enviado com sucesso! ID:", result.id);
    return { success: true, id: result.id };
  } catch (error) {
    console.error("[Email] Error sending trigger email:", error);
    return { success: false, message: String(error) };
  }
}
