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

function onlyDigits(input: string) {
  return input.replace(/\D/g, "");
}

/**
 * Converte um telefone digitado (só números ou com máscara) para formato E.164:
 * - Se já começa com 55 e tem tamanho suficiente -> +55...
 * - Se já começa com 1 e tem 11 dígitos -> +1...
 * - Se tiver 10 dígitos -> assume DEFAULT_COUNTRY_CODE (por padrão 1) e vira +1...
 * - Caso contrário -> também assume DEFAULT_COUNTRY_CODE (fallback)
 */
function toE164(input: string) {
  const digits = onlyDigits(input);

  const DEFAULT_COUNTRY_CODE = onlyDigits(process.env.DEFAULT_COUNTRY_CODE ?? "1"); // ✅ Render: DEFAULT_COUNTRY_CODE=1

  // Brasil já com DDI
  if (digits.startsWith("55") && digits.length >= 12) {
    return `+${digits}`;
  }

  // América do Norte já com DDI 1 (11 dígitos)
  if (digits.startsWith("1") && digits.length === 11) {
    return `+${digits}`;
  }

  // América do Norte no padrão local (10 dígitos) => adiciona +1
  if (digits.length === 10) {
    return `+${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  // Se veio com DDI mas sem + (ex: 1416...) e é 11 dígitos e default é 1
  if (DEFAULT_COUNTRY_CODE === "1" && digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  // Fallback: prefixa o default
  return `+${DEFAULT_COUNTRY_CODE}${digits}`;
}

/**
 * Gera possíveis variações para achar duplicados no banco,
 * porque pode existir telefone antigo salvo sem +, sem DDI, etc.
 */
function buildPhoneCandidates(rawInput: string) {
  const digits = onlyDigits(rawInput);
  const e164 = toE164(rawInput);

  // versão só dígitos do E.164 (ex: 14165551234)
  const e164Digits = onlyDigits(e164);

  const set = new Set<string>();
  set.add(digits);
  set.add(e164);
  set.add(e164Digits);

  // caso o banco tenha salvo com "+" mas sem DDI (não deveria, mas prevenimos)
  set.add(`+${digits}`);

  // se for NA e o usuário digitou 10 dígitos, também tenta "1" + 10
  if (digits.length === 10) {
    set.add(`1${digits}`);
    set.add(`+1${digits}`);
  }

  return Array.from(set);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return jsonError("Body inválido");

    const nome = String(body.nome ?? "").trim();
    const telefoneRaw = String(body.telefone ?? "").trim();
    const email = body.email ? String(body.email).trim() : null;
    const dataNascimentoStr = body.data_nascimento ? String(body.data_nascimento).trim() : null;

    if (nome.length < 2) return jsonError("Informe um nome válido.");
    if (telefoneRaw.length < 7) return jsonError("Informe um telefone válido.");

    if (email && !isValidEmail(email)) {
      return jsonError("E-mail inválido.");
    }

    let dataNascimento: Date | null = null;
    if (dataNascimentoStr) {
      const d = new Date(dataNascimentoStr);
      if (Number.isNaN(d.getTime())) return jsonError("Data de nascimento inválida.");
      dataNascimento = d;
    }

    const digits = onlyDigits(telefoneRaw);
    if (digits.length < 7) return jsonError("Telefone inválido.");

    // ✅ grava no banco em E.164 (ex: +14165551234)
    const telefoneE164 = toE164(telefoneRaw);

    // ✅ impede check-in repetido (comparando várias versões)
    const candidates = buildPhoneCandidates(telefoneRaw);

    const existing = await prisma.member.findFirst({
      where: {
        OR: candidates.map((c) => ({ telefone: c })),
      },
      select: { id: true },
    });

    if (existing) {
      return jsonError(
        "Este telefone já possui cadastro. Se precisar atualizar seus dados, fale com um voluntário. 🤍",
        409
      );
    }

    const now = new Date();

    // ✅ Cria e já insere nos 2 grupos: visitantes + convite
    // ✅ Registra a data do check-in no createdCheckinAt
    const member = await prisma.member.create({
      data: {
        nome,
        telefone: telefoneE164, // ✅ agora salva com +DDI
        email,
        dataNascimento,

        grupoVisitantes: true,
        grupoConvite: true,
        ativo: true,

        redeRelacionamento: "checkin_tablet",
        createdCheckinAt: now,
      },
      select: {
        id: true,
        nome: true,
        telefone: true,
        email: true,
        dataNascimento: true,
        grupoVisitantes: true,
        grupoConvite: true,
        createdCheckinAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: member,
      action: "created",
    });
  } catch (error) {
    console.error("Error in /api/checkin:", error);
    return jsonError("Erro ao registrar cadastro", 500);
  }
}