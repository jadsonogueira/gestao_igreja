import prisma from '@/lib/db';

type GoogleTokenPayload = {
  access_token: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  refresh_token?: string;
};

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

function isExpired(expiryDate?: Date | null) {
  if (!expiryDate) return true;
  // margem de 60s
  return expiryDate.getTime() <= Date.now() + 60_000;
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Falha ao renovar token (${r.status}): ${txt}`);
  }

  const json = (await r.json()) as GoogleTokenPayload;

  const expiryDate = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000)
    : null;

  return {
    accessToken: json.access_token,
    expiryDate,
    scope: json.scope ?? null,
    tokenType: json.token_type ?? null,
  };
}

/**
 * ✅ Retorna um access_token válido.
 * - Lê GoogleIntegration(provider="google_calendar")
 * - Se expirou, renova via refresh_token
 */
export async function getValidGoogleAccessToken(): Promise<string> {
  const integration = await prisma.googleIntegration.findUnique({
    where: { provider: 'google_calendar' },
  });

  if (!integration) {
    throw new Error('Nenhum token salvo no banco (GoogleIntegration não encontrado).');
  }

  if (!integration.refreshToken) {
    if (!isExpired(integration.expiryDate)) return integration.accessToken;
    throw new Error('Token expirado e refreshToken ausente. Reconecte o Google.');
  }

  if (!isExpired(integration.expiryDate)) return integration.accessToken;

  const refreshed = await refreshAccessToken(integration.refreshToken);

  await prisma.googleIntegration.update({
    where: { provider: 'google_calendar' },
    data: {
      accessToken: refreshed.accessToken,
      expiryDate: refreshed.expiryDate,
      scope: refreshed.scope,
      tokenType: refreshed.tokenType,
    },
  });

  return refreshed.accessToken;
}

/**
 * ✅ Client simples para chamar Google Calendar API.
 * Uso:
 * const gcal = await getGoogleCalendarClient();
 * const res = await gcal.get('/users/me/calendarList');
 */
export async function getGoogleCalendarClient() {
  const accessToken = await getValidGoogleAccessToken();

  const request = async (path: string, init?: RequestInit) => {
    const url = path.startsWith('http') ? path : `${GOOGLE_CALENDAR_API_BASE}${path}`;

    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    return res;
  };

  return {
    get: (path: string, init?: RequestInit) => request(path, { ...init, method: 'GET' }),
    post: (path: string, body?: any, init?: RequestInit) =>
      request(path, {
        ...init,
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      }),
    patch: (path: string, body?: any, init?: RequestInit) =>
      request(path, {
        ...init,
        method: 'PATCH',
        body: body ? JSON.stringify(body) : undefined,
      }),
    delete: (path: string, init?: RequestInit) => request(path, { ...init, method: 'DELETE' }),
  };
}