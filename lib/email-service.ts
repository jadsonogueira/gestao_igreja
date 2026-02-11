import type { GroupType, EscalaTipo } from "./types";
import * as path from "path";
import { getFileUrl } from "./s3";

// Labels dos grupos para o assunto do email
const groupSubjectLabels: Record<string, string> = {
  aniversario: "Envio aniversário",
  pastoral: "Envio pastoral",
  devocional: "Envio devocional",
  visitantes: "Envio visitante",
  membros_sumidos: "Envio sumido",
  convite: "Envio convite",
};

// Labels dos grupos para o corpo do email
const groupFlowLabels: Record<string, string> = {
  aniversario: "Envio aniversário",
  pastoral: "Envio pastoral",
  devocional: "Envio devocional",
  visitantes: "Envio visitante",
  membros_sumidos: "Envio sumido",
  convite: "Envio convite",
};

// Labels de Escala (assunto e corpo)
const escalaLabels: Record<string, string> = {
  DIRIGENTE: "Dirigente",
  LOUVOR: "Louvor",
  LOUVOR_ESPECIAL: "Louvor Especial",
  PREGACAO: "Pregação",
  TESTEMUNHO: "Testemunho",
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
const getFileUrlAny = getFileUrl as unknown as (cloudPath: string, options?: any) => Promise<string>;

function buildAppPublicUrl(publicPath: string) {
  // ✅ precisa existir no Render:
  // BASE_URL=https://gestao-igreja-svo6.onrender.com
  const base = getRequiredEnv("BASE_URL");

  const normalized = publicPath
    .replace(/^public\//, "") // "public/uploads/x.jpg" -> "uploads/x.jpg"
    .replace(/^\//, ""); // "/uploads/x.jpg" -> "uploads/x.jpg"

  return new URL(`/${normalized}`, base).toString(); // => https://.../uploads/x.jpg
}

async function resolveFlyerToHttpUrl(flyerUrl: string): Promise<string> {
  // Já é URL http
  if (looksLikeUrl(flyerUrl)) return flyerUrl;

  // Se for caminho local do app (não recomendado no Render, mas deixo por compatibilidade)
  if (flyerUrl.startsWith("/uploads/") || flyerUrl.startsWith("uploads/")) {
    return buildAppPublicUrl(flyerUrl);
  }

  // Todo o resto: assume que é key do S3 (inclui public/uploads/...)
  const isPublic = /(^|\/)public\//.test(flyerUrl) || /public\/uploads\//.test(flyerUrl);
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
        ${flyerUrl ? '<p><em></em></p>' : ""}
      </div>
    `;

    const attachments: Array<{ filename: string; content: string; content_type?: string }> = [];

    if (flyerUrl) {
      const resolvedUrl = await resolveFlyerToHttpUrl(flyerUrl);
      console.log("[Email] Flyer resolvido para URL:", resolvedUrl);

      const imageData = await downloadImageAsBase64(resolvedUrl);
      if (imageData) {
        attachments.push({
          filename: imageData.filename,
          content: imageData.content,
          content_type: imageData.contentType,
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

    console.log("[Email] Enviando para:", automationTo, "| from:", from, "| anexos:", attachments.length);

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

export async function sendScaleTriggerEmail(
  tipo: EscalaTipo,
  nomeResponsavel: string,
  dataEvento: string,
  horario: string | null,
  enviarEm: string,
  mensagem?: string | null
): Promise<{ success: boolean; message?: string; id?: string }> {
  try {
    const resendApiKey = getRequiredEnv("RESEND_API_KEY");
    const from = getRequiredEnv("RESEND_FROM");
    const automationTo = getRequiredEnv("AUTOMATION_EMAIL_TO");

    const label = escalaLabels[tipo] ?? "Escala";

    const subject = `[GESTAO_IGREJA]|Escala|tipo=${tipo}|responsavel=${nomeResponsavel}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <p><strong>fluxo:</strong> Escala</p>
        <p><strong>tipo:</strong> ${label}</p>
        <hr/>
        <p><strong>Responsável:</strong> ${nomeResponsavel ?? ""}</p>
        <p><strong>Data do evento:</strong> ${dataEvento ?? ""}</p>
        ${horario ? `<p><strong>Horário:</strong> ${horario}</p>` : ""}
        <p><strong>Agendado para enviar em:</strong> ${enviarEm ?? ""}</p>
        <hr/>
        ${mensagem ? `<p><strong>Mensagem:</strong></p>
        <pre style="white-space:pre-wrap; font-family: Arial, sans-serif;">${mensagem}</pre>` : ""}
      </div>
    `;

    const emailPayload: Record<string, unknown> = {
      from,
      to: [automationTo],
      subject,
      html: htmlBody,
    };

    console.log("[Email][Escala] Enviando para:", automationTo, "| from:", from, "| tipo:", tipo);

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
      console.error("[Email][Escala] Resend error:", result);
      return {
        success: false,
        message: (result?.message as string) ?? "Erro ao enviar email",
      };
    }

    console.log("[Email][Escala] Enviado com sucesso! ID:", result.id);
    return { success: true, id: result.id };
  } catch (error) {
    console.error("[Email][Escala] Error sending trigger email:", error);
    return { success: false, message: String(error) };
  }
}
