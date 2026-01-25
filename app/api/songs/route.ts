export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
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