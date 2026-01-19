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

function normalizePhone(input: string) {
  // mantém somente dígitos (melhor para comparar)
  return input.replace(/\D/g, "");
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return jsonError("Body invalido");

    const nome = String(body.nome ?? "").trim();
    const telefoneRaw = String(body.telefone ?? "").trim();
    const email = body.email ? String(body.email).trim() : null;
    const dataNascimentoStr = body.data_nascimento ? String(body.data_nascimento).trim() : null;

    if (nome.length < 2) return jsonError("Informe um nome valido.");
    if (telefoneRaw.length < 7) return jsonError("Informe um telefone valido.");

    if (email && !isValidEmail(email)) {
      return jsonError("E-mail invalido.");
    }

    let dataNascimento: Date | null = null;
    if (dataNascimentoStr) {
      const d = new Date(dataNascimentoStr);
      if (Number.isNaN(d.getTime())) return jsonError("Data de nascimento invalida.");
      dataNascimento = d;
    }

    const telefoneNormalized = normalizePhone(telefoneRaw);
    if (telefoneNormalized.length < 7) return jsonError("Telefone invalido.");

    // 1) tenta encontrar por telefone normalizado
    // Como seu schema não tem campo "telefoneNormalized", vamos comparar pelo telefone com dígitos também.
    // Para garantir consistência, vamos SALVAR o telefone no formato normalizado (somente dígitos).
    const existing = await prisma.member.findFirst({
      where: { telefone: telefoneNormalized },
      select: {
        id: true,
        redeRelacionamento: true,
        grupoVisitantes: true,
      },
    });

    // 2) Se existe, atualiza. Se não, cria.
    const member = existing
      ? await prisma.member.update({
          where: { id: existing.id },
          data: {
            nome,
            telefone: telefoneNormalized,
            email,
            dataNascimento,

            // garante flags do checkin
            grupoVisitantes: true,
            ativo: true,

            // só preenche se estiver vazio (pra não sobrescrever histórico)
            redeRelacionamento: existing.redeRelacionamento ?? "checkin_tablet",
          },
          select: {
            id: true,
            nome: true,
            telefone: true,
            email: true,
            dataNascimento: true,
            grupoVisitantes: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : await prisma.member.create({
          data: {
            nome,
            telefone: telefoneNormalized,
            email,
            dataNascimento,
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
            updatedAt: true,
          },
        });

    return NextResponse.json({
      success: true,
      data: member,
      action: existing ? "updated" : "created",
    });
  } catch (error) {
    console.error("Error in /api/checkin:", error);
    return jsonError("Erro ao registrar cadastro", 500);
  }
}