export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    automationTo: process.env.AUTOMATION_EMAIL_TO,
    resendFrom: process.env.RESEND_FROM,
  });
}