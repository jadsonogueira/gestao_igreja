export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

function onlyDigits(input: string) {
  return String(input ?? "").replace(/\D/g, "");
}

function buildDefaultMessage(nome?: string | null) {
  const n = String(nome ?? "").trim();
  if (n) return `Olá, ${n}! Tudo bem? 🙂`;
  return "Olá! Tudo bem? 🙂";
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const member = await prisma.member.findUnique({
      where: { id: params.id },
      select: { id: true, nome: true, telefone: true },
    });

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Membro não encontrado" },
        { status: 404 }
      );
    }

    if (!member.telefone) {
      return NextResponse.json(
        { success: false, error: "Membro sem telefone cadastrado" },
        { status: 400 }
      );
    }

    const digits = onlyDigits(member.telefone);

    if (!digits || digits.length < 10) {
      return NextResponse.json(
        { success: false, error: "Telefone inválido para WhatsApp" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);

    // opcional: permitir sobrescrever mensagem por querystring (?text=...)
    const textParam = searchParams.get("text");
    const text = encodeURIComponent(
      (textParam && textParam.trim()) ? textParam : buildDefaultMessage(member.nome)
    );

    const url = `https://wa.me/${digits}?text=${text}`;

    return NextResponse.redirect(url, 302);
  } catch (error) {
    console.error("Error whatsapp redirect:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao gerar link do WhatsApp" },
      { status: 500 }
    );
  }
}
