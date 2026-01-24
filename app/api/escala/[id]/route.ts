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
  membroNome?: string | null; // opcional (se quiser mandar já resolvido)
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
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as PatchBody;

    const data: any = {};

    // mensagem
    if ("mensagem" in body) {
      const msg = body.mensagem;
      data.mensagem = msg === null ? null : String(msg ?? "").trim() || null;
    }

    // envioAutomatico
    if ("envioAutomatico" in body) {
      data.envioAutomatico = Boolean(body.envioAutomatico);
    }

    // enviarEm
    if ("enviarEm" in body) {
      const v = body.enviarEm;
      if (v === null || v === undefined || v === "") {
        return NextResponse.json(
          { ok: false, error: "enviarEm é obrigatório" },
          { status: 400 }
        );
      }
      if (!isValidISODate(v)) {
        return NextResponse.json(
          { ok: false, error: "enviarEm inválido (use ISO)" },
          { status: 400 }
        );
      }
      data.enviarEm = new Date(v);
    }

    // nomeResponsavelRaw (texto cru)
    if ("nomeResponsavelRaw" in body) {
      const v = body.nomeResponsavelRaw;
      data.nomeResponsavelRaw =
        v === null ? null : String(v ?? "").trim() || null;

      // se você setou nomeResponsavelRaw manualmente, marca source como MANUAL
      data.source = "MANUAL";
    }

    // membroId / membroNome
    if ("membroId" in body) {
      const mid = body.membroId;
      if (!mid) {
        data.membroId = null;
        data.membroNome = null;
      } else {
        // valida se existe
        const member = await prisma.member.findUnique({
          where: { id: mid },
          select: { id: true, nome: true },
        });

        if (!member) {
          return NextResponse.json(
            { ok: false, error: "Member não encontrado" },
            { status: 404 }
          );
        }

        data.membroId = member.id;
        data.membroNome = member.nome;
        // se você vinculou manualmente, também marca como MANUAL
        data.source = "MANUAL";
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Nenhum campo para atualizar" },
        { status: 400 }
      );
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
