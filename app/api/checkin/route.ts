export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return jsonError("Body invalido");

    const nome = String(body.nome ?? "").trim();
    const telefone = String(body.telefone ?? "").trim();
    const email = body.email ? String(body.email).trim() : null;
    const dataNascimentoStr = body.data_nascimento ? String(body.data_nascimento).trim() : null;

    if (nome.length < 2) return jsonError("Informe um nome valido.");
    if (telefone.length < 7) return jsonError("Informe um telefone valido.");

    if (email && !isValidEmail(email)) {
      return jsonError("E-mail invalido.");
    }

    let dataNascimento: Date | null = null;
    if (dataNascimentoStr) {
      const d = new Date(dataNascimentoStr);
      if (Number.isNaN(d.getTime())) return jsonError("Data de nascimento invalida.");
      dataNascimento = d;
    }

    const member = await prisma.member.create({
      data: {
        nome,
        telefone, // mesmo sendo opcional no schema, aqui vamos exigir no checkin
        email,
        dataNascimento,

        // marcacoes do tablet
        grupoVisitantes: true,
        ativo: true,
        redeRelacionamento: "checkin_tablet",
      },
      select: {
        id: true,
        nome: true,
        telefone: true,
        email: true,
        dataNascimento: true,
        grupoVisitantes: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: member });
  } catch (error) {
    console.error("Error in /api/checkin:", error);
    return jsonError("Erro ao registrar cadastro", 500);
  }
}