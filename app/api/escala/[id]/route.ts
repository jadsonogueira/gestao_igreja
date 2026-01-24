export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const item = await prisma.escala.findUnique({ where: { id: params.id } });
    if (!item) {
      return NextResponse.json({ success: false, error: 'Item não encontrado' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error('Error reading escala:', error);
    return NextResponse.json({ success: false, error: 'Erro ao buscar item' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();

    const data: any = {};
    if (body?.tipo) data.tipo = String(body.tipo);
    if (body?.dataEvento) data.dataEvento = new Date(body.dataEvento);

    // ✅ Campos antigos removidos do schema (horario, nomeResponsavel)
    // Mantemos compatibilidade: se vier "nomeResponsavel", gravamos em nomeResponsavelRaw/membroNome.
    if (body?.nomeResponsavel !== undefined) {
      const v = String(body.nomeResponsavel ?? '').trim();
      data.nomeResponsavelRaw = v || null;
      data.membroNome = v || null;
      data.membroId = null; // se virou texto cru, desvincula do Member
    }

    if (body?.nomeResponsavelRaw !== undefined) {
      const v = String(body.nomeResponsavelRaw ?? '').trim();
      data.nomeResponsavelRaw = v || null;
    }

    if (body?.membroNome !== undefined) {
      const v = String(body.membroNome ?? '').trim();
      data.membroNome = v || null;
    }

    if (body?.membroId !== undefined) {
      const v = String(body.membroId ?? '').trim();
      data.membroId = v ? v : null;
    }

    if (body?.mensagem !== undefined) data.mensagem = body.mensagem ? String(body.mensagem) : null;
    if (body?.envioAutomatico !== undefined) data.envioAutomatico = !!body.envioAutomatico;
    if (body?.enviarEm) data.enviarEm = new Date(body.enviarEm);
    if (body?.status) data.status = String(body.status);

    const item = await prisma.escala.update({ where: { id: params.id }, data });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error('Error updating escala:', error);
    return NextResponse.json({ success: false, error: 'Erro ao atualizar item' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.escala.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting escala:', error);
    return NextResponse.json({ success: false, error: 'Erro ao excluir item' }, { status: 500 });
  }
}
