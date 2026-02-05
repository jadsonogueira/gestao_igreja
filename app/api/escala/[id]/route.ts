export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type PatchBody = {
  mensagem?: string | null;
  envioAutomatico?: boolean;
  enviarEm?: string; // ISO
  nomeResponsavelRaw?: string | null;

  membroId?: string | null; // ObjectId string
  membroNome?: string | null; // opcional
};

function isValidISODate(s: string) {
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as PatchBody;

    const data: any = {};

    if ("mensagem" in body) {
      const msg = body.mensagem;
      data.mensagem = msg === null ? null : String(msg ?? "").trim() || null;
    }

    if ("envioAutomatico" in body) {
      data.envioAutomatico = Boolean(body.envioAutomatico);
    }

    if ("enviarEm" in body) {
      const v = body.enviarEm;
      if (v === null || v === undefined || v === "") {
        return NextResponse.json({ ok: false, error: "enviarEm é obrigatório" }, { status: 400 });
      }
      if (!isValidISODate(v)) {
        return NextResponse.json(
          { ok: false, error: "enviarEm inválido (use ISO)" },
          { status: 400 }
        );
      }
      data.enviarEm = new Date(v);
    }

    if ("nomeResponsavelRaw" in body) {
      const v = body.nomeResponsavelRaw;
      data.nomeResponsavelRaw = v === null ? null : String(v ?? "").trim() || null;
      data.source = "MANUAL";
    }

    if ("membroId" in body) {
      const mid = body.membroId;
      if (!mid) {
        data.membroId = null;
        data.membroNome = null;
      } else {
        const member = await prisma.member.findUnique({
          where: { id: mid },
          select: { id: true, nome: true },
        });

        if (!member) {
          return NextResponse.json({ ok: false, error: "Member não encontrado" }, { status: 404 });
        }

        data.membroId = member.id;
        data.membroNome = member.nome;
        data.source = "MANUAL";
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "Nenhum campo para atualizar" }, { status: 400 });
    }

    const updated = await prisma.escala.update({
      where: { id },
      data,
      select: {
        id: true,
        tipo: true,
        dataEvento: true,
        membroId: true,
        membroNome: true,
        nomeResponsavelRaw: true,
        mensagem: true,
        envioAutomatico: true,
        enviarEm: true,
        status: true,
        googleEventId: true,
        googleCalendarId: true,
        source: true,
        lastSyncedAt: true,
        updatedAt: true,
        dataEnvio: true,
      },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (e: any) {
    console.error("PATCH /api/escala/[id] error:", e);
    return NextResponse.json(
      { ok: false, error: "Falha ao atualizar escala", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }

    // opcional: checar se existe antes
    const exists = await prisma.escala.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      return NextResponse.json({ ok: false, error: "Escala não encontrada" }, { status: 404 });
    }

    await prisma.escala.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/escala/[id] error:", e);
    return NextResponse.json(
      { ok: false, error: "Falha ao excluir escala", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}