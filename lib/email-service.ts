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
  if (!v) throw new Error(`${name} não configurado`);
  return v;
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function extractFilenameFromUrl(url: string, fallbackExt = "png") {
  let filename = "panfleto";
  try {
    const urlPath = new URL(url).pathname;
    filename = path.basename(urlPath) || "panfleto";
  } catch {
    // ignore
  }

  if (!filename.includes(".")) {
    filename = `${filename}.${fallbackExt}`;
  }
  return filename;
}

// ⚠️ Compatível com assinatura nova do getFileUrl (options object)
// e também não quebra TS caso a assinatura mude novamente.
const getFileUrlAny = getFileUrl as unknown as (cloudPath: string, options?: any) => Promise<string>;

async function resolveFlyerToHttpUrl(flyerUrl: string): Promise<string> {
  // Se já é URL http, ok
  if (looksLikeUrl(flyerUrl)) return flyerUrl;

  // Se é key do bucket, decide se é publico pelo prefixo
  const isPublic = /(^|\/)public\//.test(flyerUrl) || /public\/uploads\//.test(flyerUrl);

  // ✅ assinatura nova: getFileUrl(path, { public: true/false })
  return await getFileUrlAny(flyerUrl, { public: isPublic });
}

// Função para baixar imagem e converter para base64
async function downloadImageAsBase64(
  url: string
): Promise<{ content: string; filename: string; contentType: string } | null> {
  try {
    console.log("[Email] Baixando imagem:", url);

    const response = await fetch(url);

    if (!response.ok) {
      console.error("[Email] Erro ao baixar imagem:", response.status);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    const contentType = response.headers.get("content-type") ?? "image/png";
    const ext = contentType.split("/")[1] ?? "png";
    const filename = extractFilenameFromUrl(url, ext);

    console.log("[Email] Imagem baixada:", filename, "tamanho:", buffer.length, "bytes");
    return { content: base64, filename, contentType };
  } catch (error) {
    console.error("[Email] Erro ao processar imagem:", error);
    return null;
  }
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

    const subject = `[GESTAO_IGREJA]|${subjectLabel}|grupo=${grupo}|membro=${memberName}`;

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
        <pre style="white-space:pre-wrap; font-family: Arial, sans-serif;">${mensagem ?? ""}</pre>
        ${flyerUrl ? '<p><em>📎 Panfleto anexado a este email</em></p>' : ""}
      </div>
    `;

    // Preparar attachments se houver flyerUrl
    const attachments: Array<{ filename: string; content: string; content_type?: string }> = [];

    if (flyerUrl) {
      // ✅ resolve key -> URL pública/assinada antes de baixar
      const resolvedUrl = await resolveFlyerToHttpUrl(flyerUrl);

      const imageData = await downloadImageAsBase64(resolvedUrl);
      if (imageData) {
        attachments.push({
          filename: imageData.filename,
          content: imageData.content,
          content_type: imageData.contentType, // ajuda alguns clientes
        });
        console.log("[Email] Anexo adicionado:", imageData.filename);
      } else {
        console.warn("[Email] Não foi possível anexar imagem:", flyerUrl);
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
      "[Email] Enviando para:",
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
