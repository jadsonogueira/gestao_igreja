export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean)
    .map((t) => t.replace(/\s+/g, " "));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const q = (searchParams.get("q") ?? "").trim().toLowerCase();
    const key = (searchParams.get("key") ?? "").trim();
    const chord = (searchParams.get("chord") ?? "").trim();
    const tag = (searchParams.get("tag") ?? "").trim();

    const page = toInt(searchParams.get("page"), 1);
    const limit = Math.min(toInt(searchParams.get("limit"), 20), 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (q) {
      // searchIndex já está em lower-case
      where.searchIndex = { contains: q };
    }

    if (key) {
      where.originalKey = key;
    }

    if (chord) {
      where.chordsUsed = { has: chord };
    }

    if (tag) {
      where.tags = { has: tag };
    }

    const [total, items] = await Promise.all([
      prisma.song.count({ where }),
      prisma.song.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          artist: true,
          originalKey: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
      },
    });
  } catch (error) {
    console.error("Error listing songs:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao listar cifras" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const artist =
      typeof body?.artist === "string" ? body.artist.trim() : body?.artist === null ? null : "";
    const originalKey =
      typeof body?.originalKey === "string" ? body.originalKey.trim() : "";
    const tags = normalizeTags(body?.tags);

    if (!title) {
      return NextResponse.json(
        { success: false, error: "Título é obrigatório" },
        { status: 400 }
      );
    }

    if (!originalKey) {
      return NextResponse.json(
        { success: false, error: "Tom original é obrigatório" },
        { status: 400 }
      );
    }

    const searchIndex = `${title} ${artist ?? ""} ${tags.join(" ")}`.trim().toLowerCase();

    const song = await prisma.song.create({
      data: {
        title,
        artist: artist || null,
        originalKey,
        rawText: "",
        tags,
        chordsUsed: [],
        searchIndex,
        // conteúdo inicial vazio (editor já sabe lidar com isso)
        content: {
          parts: [
            {
              name: "Geral",
              lines: [],
            },
          ],
        },
      },
      select: { id: true },
    });

    return NextResponse.json({
      success: true,
      data: { id: song.id },
    });
  } catch (error) {
    console.error("Error creating song:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao criar cifra" },
      { status: 500 }
    );
  }
}