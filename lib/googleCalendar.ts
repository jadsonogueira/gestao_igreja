import prisma from '@/lib/db';

/**
 * Obtém um access token válido do Google Calendar.
 * - Busca no Mongo
 * - Verifica expiração
 * - Renova automaticamente usando refresh_token, se necessário
 */
async function getValidGoogleAccessToken(): Promise<string> {
  const integration = await prisma.googleIntegration.findUnique({
    where: { provider: 'google_calendar' },
  });

  if (!integration) {
    throw new Error('Google Calendar não conectado');
  }

  if (!integration.accessToken || !integration.refreshToken) {
    throw new Error('Credenciais do Google incompletas');
  }

  // Se não tiver expiryDate, assume válido
  if (!integration.expiryDate) {
    return integration.accessToken;
  }

  const expiresAt = new Date(integration.expiryDate).getTime();
  const now = Date.now();

  // margem de 1 minuto
  const isExpired = now > expiresAt - 60_000;

  if (!isExpired) {
    return integration.accessToken;
  }

  // 🔄 Refresh do token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: integration.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    console.error('Erro ao renovar token Google:', data);
    throw new Error('Falha ao renovar token do Google');
  }

  const newExpiryDate = new Date(Date.now() + data.expires_in * 1000);

  await prisma.googleIntegration.update({
    where: { id: integration.id },
    data: {
      accessToken: data.access_token,
      expiryDate: newExpiryDate,
    },
  });

  return data.access_token;
}

/**
 * Retorna um client simples para acessar a Google Calendar API
 */
export async function getGoogleCalendarClient() {
  const accessToken = await getValidGoogleAccessToken();

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    throw new Error('GOOGLE_CALENDAR_ID não configurado');
  }

  const baseUrl = 'https://www.googleapis.com/calendar/v3';

  async function googleFetch(
    path: string,
    init: RequestInit = {}
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  return {
    calendarId,
    googleFetch,
  };
}

/**
 * Helper para trabalhar com eventos all-day (sem horário)
 * Retorna o range no padrão do Google Calendar
 */
export function buildAllDayRange(date: string) {
  // date no formato YYYY-MM-DD
  const startDate = date;

  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  const endDate = end.toISOString().slice(0, 10);

  return {
    startDate,
    endDate,
  };
}