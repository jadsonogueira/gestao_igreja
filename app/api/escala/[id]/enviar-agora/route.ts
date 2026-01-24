export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { processEscalaEmail } from "@/lib/processEscalaEmail";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;

  if (!id) {
    return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
  }

  const result = await processEscalaEmail(id, { manual: true, sendAt: new Date() });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "Falha ao enviar agora" },
      { status: result.status }
    );
  }

  return NextResponse.json({ ok: true, message: "Envio realizado agora." });
}
