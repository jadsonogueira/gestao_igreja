export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getGoogleCalendarClient } from "@/lib/googleCalendar";

export async function GET() {
  try {
    const { googleFetch } = await getGoogleCalendarClient();

    const res = await googleFetch("/users/me/calendarList?maxResults=250");
    const json = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, status: res.status, body: json },
        { status: 500 }
      );
    }

    const items = (json.items ?? []).map((c: any) => ({
      id: c.id,
      summary: c.summary,
      primary: !!c.primary,
      accessRole: c.accessRole,
      timeZone: c.timeZone,
    }));

    return NextResponse.json({
      ok: true,
      count: items.length,
      calendars: items,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}