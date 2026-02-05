export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getGoogleCalendarClient } from "@/lib/googleCalendar";

export async function GET() {
  try {
    // 1) Confere se existe integração salva
    const integration = await prisma.googleIntegration.findUnique({
      where: { provider: "google_calendar" },
    });

    if (!integration) {
      return NextResponse.json({
        ok: true,
        connected: false,
        reason: "not_connected",
        details: "Nenhum token salvo no banco (GoogleIntegration não encontrado).",
      });
    }

    // 2) Confere envs essenciais (sem vazar valores)
    const hasClientId = !!process.env.GOOGLE_CLIENT_ID;
    const hasClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;
    const hasRedirect = !!process.env.GOOGLE_REDIRECT_URI;
    const hasCalendarId = !!process.env.GOOGLE_CALENDAR_ID;

    if (!hasClientId || !hasClientSecret || !hasRedirect || !hasCalendarId) {
      return NextResponse.json({
        ok: true,
        connected: false,
        reason: "missing_env",
        details: {
          GOOGLE_CLIENT_ID: hasClientId,
          GOOGLE_CLIENT_SECRET: hasClientSecret,
          GOOGLE_REDIRECT_URI: hasRedirect,
          GOOGLE_CALENDAR_ID: hasCalendarId,
        },
      });
    }

    // 3) Valida se o token está utilizável (isso pode fazer refresh automaticamente)
    const gcal = await getGoogleCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID as string;

    // Chamada leve: pega metadados do calendário (confere permissão e calendarId)
    const res = await gcal.get(`/calendars/${encodeURIComponent(calendarId)}`);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json({
        ok: true,
        connected: false,
        reason: "google_api_error",
        details: {
          status: res.status,
          statusText: res.statusText,
          body: txt.slice(0, 300),
        },
      });
    }

    const cal = await res.json();

    return NextResponse.json({
      ok: true,
      connected: true,
      calendar: {
        id: cal?.id,
        summary: cal?.summary,
        timeZone: cal?.timeZone,
      },
      token: {
        hasRefreshToken: !!integration.refreshToken,
        expiryDate: integration.expiryDate ?? null,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        connected: false,
        reason: "exception",
        details: String(err?.message ?? err),
      },
      { status: 500 }
    );
  }
}