export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

type Params = { params: { id: string } };

function normalizeName(base: string) {
  return String(base ?? "").trim().replace(/\s+/g, " ");
}

async function generateUniqueName(baseName: string) {
  const base = normalizeName(baseName) || "Lista";

  // tenta: "Base (cópia)", depois "Base (cópia 2)", "Base (cópia 3)"...
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? `${base} (cópia)` : `${base} (cópia ${n})`;

    const exists = await prisma.songList.findFirst({
      where: { name: candidate },
      select: { id: true },
    });

    if (!exists) return candidate;
  }

  // fallback (muito improvável)
  return `${base} (cópia ${Date.now()})`;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const sourceListId = params.id;

    // opcional: { name: "Novo Nome" }
    const body = await req.json().catch(() => null);
    const requestedName = normalizeName(body?.name ?? "");

    const source = await prisma.songList.findUnique({
      where: { id: sourceListId },
      include: {
        items: {
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          select: { songId: true, order: true },
        },
      },
    });

    if (!source) {
      return NextResponse.json(
        { success: false, error: "Lista não encontrada" },
        { status: 404 }
      );
    }

    const newName = requestedName
      ? requestedName
      : await generateUniqueName(source.name);

    const created = await prisma.$transaction(async (tx) => {
      const newList = await tx.songList.create({
        data: { name: newName },
        select: { id: true, name: true },
      });

      if (source.items?.length) {
        await tx.songListItem.createMany({
          data: source.items.map((it) => ({
            listId: newList.id,
            songId: it.songId,
            order: it.order ?? 0,
          })),
        });
      }

      return newList;
    });

    return NextResponse.json({
      success: true,
      data: { id: created.id, name: created.name },
    });
  } catch (error: any) {
    // colisão de nome (unique)
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Já existe uma lista com esse nome" },
        { status: 409 }
      );
    }

    console.error("POST /api/song-lists/[id]/duplicate error:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao duplicar lista" },
      { status: 500 }
    );
  }
}