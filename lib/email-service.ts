import type { GroupType } from './types';
import * as fs from 'fs';
import * as path from 'path';

// Email de destino para os gatilhos do Power Automate
// Nota: Resend em modo teste só permite enviar para email da conta
const TRIGGER_EMAIL = 'jadsonnogueira@gmail.com';

// Labels dos grupos para o assunto do email
const groupSubjectLabels: Record<string, string> = {
  aniversario: 'Envio aniversário',
  pastoral: 'Envio pastoral',
  devocional: 'Envio devocional',
  visitantes: 'Envio visitante',
  membros_sumidos: 'Envio sumido',
};

// Labels dos grupos para o corpo do email
const groupFlowLabels: Record<string, string> = {
  aniversario: 'Envio aniversário',
  pastoral: 'Envio pastoral',
  devocional: 'Envio devocional',
  visitantes: 'Envio visitante',
  membros_sumidos: 'Envio sumido',
};

// Função para obter a API key do Resend
function getResendApiKey(): string {
  // 1. Tentar variável de ambiente primeiro
  if (process.env.RESEND_API_KEY) {
    return process.env.RESEND_API_KEY;
  }
  
  // 2. Tentar arquivo de secrets em diferentes locais
  const secretsPaths = [
    '/home/ubuntu/.config/abacusai_auth_secrets.json',
    path.join(process.cwd(), '.config', 'abacusai_auth_secrets.json'),
    '/run/secrets/abacusai_auth_secrets.json',
  ];
  
  for (const secretsPath of secretsPaths) {
    try {
      if (fs.existsSync(secretsPath)) {
        const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
        const key = secrets?.resend?.secrets?.api_key?.value;
        if (key) {
          console.log('[Email] Resend API key encontrada em:', secretsPath);
          return key;
        }
      }
    } catch (e) {
      // Continue tentando outros paths
    }
  }
  
  console.error('[Email] Resend API key não encontrada');
  return '';
}

// Função para baixar imagem e converter para base64
async function downloadImageAsBase64(url: string): Promise<{ content: string; filename: string; contentType: string } | null> {
  try {
    console.log('[Email] Baixando imagem:', url);
    const response = await fetch(url);
    if (!response.ok) {
      console.error('[Email] Erro ao baixar imagem:', response.status);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    
    // Detectar tipo de conteúdo
    const contentType = response.headers.get('content-type') ?? 'image/png';
    
    // Extrair nome do arquivo da URL
    const urlPath = new URL(url).pathname;
    let filename = path.basename(urlPath) || 'panfleto.png';
    
    // Garantir extensão correta
    if (!filename.includes('.')) {
      const ext = contentType.split('/')[1] ?? 'png';
      filename = `panfleto.${ext}`;
    }
    
    console.log('[Email] Imagem baixada:', filename, 'tamanho:', buffer.length, 'bytes');
    return { content: base64, filename, contentType };
  } catch (error) {
    console.error('[Email] Erro ao processar imagem:', error);
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
    const resendApiKey = getResendApiKey();
    
    if (!resendApiKey) {
      return { success: false, message: 'API key do Resend não configurada' };
    }

    const subject = groupSubjectLabels[grupo] ?? 'Envio igreja';
    const fluxo = groupFlowLabels[grupo] ?? 'Envio igreja';

    // HTML formatado
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <p><strong>fluxo:</strong> ${fluxo}</p>
        <p><strong>Nome:</strong> ${memberName}</p>
        <p><strong>Email:</strong> ${memberEmail}</p>
        <p><strong>Telefone:</strong> ${memberPhone}</p>
        <p><strong>Agendamento:</strong> ${agendamento}</p>
        <p><strong>Mensagem:</strong> ${mensagem}</p>
        ${flyerUrl ? '<p><em>📎 Panfleto anexado a este email</em></p>' : ''}
      </div>
    `;

    // Preparar attachments se houver flyerUrl
    const attachments: Array<{ filename: string; content: string }> = [];
    
    if (flyerUrl) {
      const imageData = await downloadImageAsBase64(flyerUrl);
      if (imageData) {
        attachments.push({
          filename: imageData.filename,
          content: imageData.content,
        });
        console.log('[Email] Anexo adicionado:', imageData.filename);
      } else {
        console.warn('[Email] Não foi possível anexar imagem:', flyerUrl);
      }
    }

    // Enviar via Resend API (suporta anexos)
    const emailPayload: Record<string, unknown> = {
      from: 'Igreja <onboarding@resend.dev>',
      to: [TRIGGER_EMAIL],
      subject: subject,
      html: htmlBody,
    };

    if (attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    console.log('[Email] Enviando para:', TRIGGER_EMAIL, 'com', attachments.length, 'anexo(s)');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(emailPayload),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('[Email] Resend error:', result);
      return { success: false, message: result.message ?? 'Erro ao enviar email' };
    }

    console.log('[Email] Enviado com sucesso! ID:', result.id);
    return { success: true, id: result.id };
  } catch (error) {
    console.error('[Email] Error sending trigger email:', error);
    return { success: false, message: String(error) };
  }
}
