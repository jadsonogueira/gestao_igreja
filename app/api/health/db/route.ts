export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    await prisma.$runCommandRaw({ ping: 1 });

    return NextResponse.json({
      success: true,
      message: "Conexão com MongoDB OK",
    });
  } catch (error) {
    console.error("DB HEALTH ERROR:", error);
    return NextResponse.json(
      { success: false, error: "Falha ao conectar no MongoDB" },
      { status: 500 }
    );
  }
}