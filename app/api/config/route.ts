export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type SystemConfigRow = {
  id: string;
  automacaoAtiva: boolean;
  ultimaVerificacao: Date | null;
  updatedAt?: Date;
};

type GetResponse =
  | {
      success: true;
      config: {
        automacaoAtiva: boolean;
        ultimaVerificacao: Date | null;
      };
    }
  | { success: false; error: string };

type PostResponse =
  | {
      success: true;
      message: string;
      config: {
        automacaoAtiva: boolean;
        ultimaVerificacao: Date | null;
      };
    }
  | { success: false; error: string };

export async function GET() {
  try {
    let config = (await prisma.systemConfig.findFirst()) as SystemConfigRow | null;

    // Se não existir configuração, criar uma (runtime only; não no build)
    if (!config) {
      config = (await prisma.systemConfig.create({
        data: { automacaoAtiva: true },
      })) as SystemConfigRow;
    }

    const payload: GetResponse = {
      success: true,
      config: {
        automacaoAtiva: config.automacaoAtiva,
        ultimaVerificacao: config.ultimaVerificacao ?? null,
      },
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error fetching config:", error);

    const payload: GetResponse = { success: false, error: "Erro ao buscar configuração" };
    return NextResponse.json(payload, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    const automacaoAtiva =
      typeof body === "object" && body !== null && "automacaoAtiva" in body
        ? (body as { automacaoAtiva: unknown }).automacaoAtiva
        : undefined;

    if (typeof automacaoAtiva !== "boolean") {
      const payload: PostResponse = {
        success: false,
        error: "automacaoAtiva deve ser um boolean",
      };
      return NextResponse.json(payload, { status: 400 });
    }

    let config = (await prisma.systemConfig.findFirst()) as SystemConfigRow | null;

    if (!config) {
      config = (await prisma.systemConfig.create({
        data: { automacaoAtiva },
      })) as SystemConfigRow;
    } else {
      config = (await prisma.systemConfig.update({
        where: { id: config.id },
        data: {
          automacaoAtiva,
          updatedAt: new Date(),
        },
      })) as SystemConfigRow;
    }

    const payload: PostResponse = {
      success: true,
      message: `Automação ${automacaoAtiva ? "ativada" : "desativada"} com sucesso`,
      config: {
        automacaoAtiva: config.automacaoAtiva,
        ultimaVerificacao: config.ultimaVerificacao ?? null,
      },
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error updating config:", error);

    const payload: PostResponse = { success: false, error: "Erro ao atualizar configuração" };
    return NextResponse.json(payload, { status: 500 });
  }
}