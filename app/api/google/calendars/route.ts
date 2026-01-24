export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getGoogleCalendarClient } from '@/lib/googleCalendar';

export async function GET() {
  try {
    const client = await getGoogleCalendarClient();

    const res = await client.get('/users/me/calendarList?maxResults=250');
    const json = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'google_api_error',
          details: {
            status: res.status,
            statusText: res.statusText,
            body: json,
          },
        },
        { status: 500 }
      );
    }

    const items = Array.isArray(json?.items) ? json.items : [];

    return NextResponse.json({
      ok: true,
      count: items.length,
      calendars: items.map((c: any) => ({
        id: c?.id,
        summary: c?.summary,
        primary: !!c?.primary,
        accessRole: c?.accessRole,
        timeZone: c?.timeZone,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}