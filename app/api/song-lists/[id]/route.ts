export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type Params = {
  params: { id: string };
};

export async function GET(_req: Request, { params }: Params) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID da lista não informado" },
        { status: 400 }
      );
    }

    const list = await prisma.songList.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { order: "asc" },
          include: {
            song: {
              select: {
                id: true,
                title: true,
                artist: true,
                originalKey: true,
                tags: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!list) {
      return NextResponse.json(
        { success: false, error: "Lista não encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: list,
    });
  } catch (error) {
    console.error("Error fetching song list:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao buscar lista" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID da lista não informado" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Body inválido" },
        { status: 400 }
      );
    }

    // Permitimos atualizar apenas o nome (e outras flags futuras)
    const name =
      typeof body.name === "string" ? body.name.trim() : undefined;

    const dataToUpdate: any = {};
    if (name) dataToUpdate.name = name;

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json(
        { success: false, error: "Nada para atualizar" },
        { status: 400 }
      );
    }

    const updated = await prisma.songList.update({
      where: { id },
      data: dataToUpdate,
      select: { id: true, name: true, updatedAt: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating song list:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao atualizar lista" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID da lista não informado" },
        { status: 400 }
      );
    }

    // apaga itens primeiro (Mongo + Prisma às vezes não faz cascade perfeito)
    await prisma.songListItem.deleteMany({
      where: { listId: id },
    });

    await prisma.songList.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting song list:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao excluir lista" },
      { status: 500 }
    );
  }
}