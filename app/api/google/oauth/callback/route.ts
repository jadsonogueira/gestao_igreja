export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const scope = url.searchParams.get("scope") ?? "";
    const state = url.searchParams.get("state") ?? "";

    if (!code) {
      return NextResponse.json(
        { ok: false, error: "Missing code in callback", state, scope },
        { status: 400 }
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing envs",
          envs: {
            GOOGLE_CLIENT_ID: !!clientId,
            GOOGLE_CLIENT_SECRET: !!clientSecret,
            GOOGLE_REDIRECT_URI: !!redirectUri,
          },
        },
        { status: 500 }
      );
    }

    // troca code por tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenJson: any = await tokenRes.json();

    if (!tokenRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Token exchange failed",
          status: tokenRes.status,
          body: tokenJson,
        },
        { status: 500 }
      );
    }

    const accessToken = tokenJson.access_token as string | undefined;
    const refreshToken = tokenJson.refresh_token as string | undefined;
    const tokenType = tokenJson.token_type as string | undefined;
    const expiresIn = tokenJson.expires_in as number | undefined;

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "No access_token returned", body: tokenJson },
        { status: 500 }
      );
    }

    const expiryDate = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    const saved = await prisma.googleIntegration.upsert({
      where: { provider: "google_calendar" },
      create: {
        provider: "google_calendar",
        accessToken,
        refreshToken: refreshToken ?? null,
        tokenType: tokenType ?? null,
        scope: scope || tokenJson.scope || null,
        expiryDate,
      },
      update: {
        accessToken,
        // refresh_token pode vir só na primeira autorização; não sobrescreve com null
        refreshToken: refreshToken ?? undefined,
        tokenType: tokenType ?? null,
        scope: scope || tokenJson.scope || null,
        expiryDate,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Google conectado e token salvo no banco ✅",
      saved: {
        id: saved.id,
        provider: saved.provider,
        hasRefreshToken: !!saved.refreshToken,
        expiryDate: saved.expiryDate,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}