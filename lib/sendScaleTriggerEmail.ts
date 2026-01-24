import { Resend } from 'resend';

type EscalaTipo =
  | 'DIRIGENTE'
  | 'LOUVOR'
  | 'LOUVOR_ESPECIAL'
  | 'PREGACAO'
  | 'TESTEMUNHO'
  | 'APOIO';

function tipoLabel(tipo: EscalaTipo) {
  switch (tipo) {
    case 'DIRIGENTE':
      return 'Dirigente';
    case 'LOUVOR':
      return 'Louvor';
    case 'LOUVOR_ESPECIAL':
      return 'Louvor Especial';
    case 'PREGACAO':
      return 'Pregação';
    case 'TESTEMUNHO':
      return 'Testemunho';
    case 'APOIO':
      return 'Apoio';
    default:
      return String(tipo);
  }
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * Envia e-mail gatilho (Power Automate) para a ESCALA.
 * ⚠️ Destino SEMPRE fixo: AUTOMATION_EMAIL_TO (fallback: jadsonnogueira@msn.com)
 */
export async function sendScaleTriggerEmail(
  tipo: EscalaTipo,
  responsavel: string,
  dataEventoFmt: string,
  horario: string | null,
  enviarEm: Date,
  mensagemOpcional: string | null
) {
  const apiKey = process.env.RESEND_API_KEY ?? '';
  const from = process.env.RESEND_FROM ?? 'Igreja ABL <rpa@ablchurch.ca>';

  if (!apiKey) {
    throw new Error('RESEND_API_KEY não configurado');
  }

  // ✅ destino fixo
  const to = process.env.AUTOMATION_EMAIL_TO ?? 'jadsonnogueira@msn.com';

  const tipoText = tipoLabel(tipo);

  // Assunto padronizado para facilitar filtros no Power Automate
  const subject = `ESCALA | ${tipoText} | ${dataEventoFmt}`;

  const safeMsg = mensagemOpcional?.trim() ? escapeHtml(mensagemOpcional.trim()) : null;

  // Conteúdo em HTML + texto
  const textLines = [
    `Tipo: ${tipoText}`,
    `Data: ${dataEventoFmt}`,
    horario ? `Horário: ${horario}` : null,
    `Responsável: ${responsavel}`,
    `Enviar em: ${enviarEm.toISOString()}`,
    safeMsg ? `Mensagem: ${mensagemOpcional}` : null,
  ].filter(Boolean) as string[];

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5">
      <h2 style="margin: 0 0 12px">Escala do Culto</h2>
      <table cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 640px">
        <tr>
          <td style="border: 1px solid #eee; width: 180px"><b>Tipo</b></td>
          <td style="border: 1px solid #eee">${escapeHtml(tipoText)}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #eee"><b>Data</b></td>
          <td style="border: 1px solid #eee">${escapeHtml(dataEventoFmt)}</td>
        </tr>
        ${
          horario
            ? `<tr>
                <td style="border: 1px solid #eee"><b>Horário</b></td>
                <td style="border: 1px solid #eee">${escapeHtml(horario)}</td>
              </tr>`
            : ''
        }
        <tr>
          <td style="border: 1px solid #eee"><b>Responsável</b></td>
          <td style="border: 1px solid #eee">${escapeHtml(responsavel)}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #eee"><b>Enviar em</b></td>
          <td style="border: 1px solid #eee">${escapeHtml(enviarEm.toISOString())}</td>
        </tr>
      </table>

      ${
        safeMsg
          ? `<div style="margin-top: 14px; padding: 12px; border: 1px solid #eee; border-radius: 8px">
               <b>Mensagem (opcional):</b><br/>
               <div style="margin-top: 6px; white-space: pre-wrap">${safeMsg}</div>
             </div>`
          : ''
      }

      <p style="margin-top: 16px; color: #666; font-size: 12px">
        (Este e-mail é um gatilho para automação. Não responder.)
      </p>
    </div>
  `.trim();

  const resend = new Resend(apiKey);

  const result = await resend.emails.send({
    from,
    to,
    subject,
    text: textLines.join('\n'),
    html,
  });

  if ((result as any)?.error) {
    throw new Error((result as any).error?.message ?? 'Falha ao enviar via Resend');
  }

  return result;
}