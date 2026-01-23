export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} não configurado`);
  return v;
}

export async function GET() {
  try {
    const clientId = requiredEnv("GOOGLE_CLIENT_ID");
    const redirectUri = requiredEnv("GOOGLE_REDIRECT_URI");

    // state simples (poderíamos armazenar em cookie depois, mas aqui é só pra conectar)
    const state = crypto.randomUUID();

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");

    // Escopo completo do Calendar (ler/escrever/atualizar)
    authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/calendar");

    // Para garantir refresh_token
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");

    // só para validação básica no callback
    authUrl.searchParams.set("state", state);

    return NextResponse.redirect(authUrl.toString());
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: String(err?.message ?? err),
        hint:
          "Verifique GOOGLE_CLIENT_ID e GOOGLE_REDIRECT_URI no Render. A rota deve redirecionar para accounts.google.com.",
      },
      { status: 500 }
    );
  }
}