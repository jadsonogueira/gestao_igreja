import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

// Tipagem do body do POST
interface SystemConfigBody {
  automacaoAtiva: boolean;
}

// GET - Obter configuração do sistema
export async function GET() {
  try {
    let config = await prisma.systemConfig.findFirst();

    // Se não existir configuração, criar uma
    if (!config) {
      config = await prisma.systemConfig.create({
        data: {
          automacaoAtiva: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      config: {
        automacaoAtiva: config.automacaoAtiva,
        ultimaVerificacao: config.ultimaVerificacao,
      },
    });
  } catch (error) {
    console.error('Error fetching config:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao buscar configuração' },
      { status: 500 }
    );
  }
}

// POST - Atualizar configuração do sistema
export async function POST(request: Request) {
  try {
    const body: SystemConfigBody = await request.json();
    const { automacaoAtiva } = body;

    if (typeof automacaoAtiva !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'automacaoAtiva deve ser um boolean' },
        { status: 400 }
      );
    }

    // Buscar ou criar configuração
    let config = await prisma.systemConfig.findFirst();

    if (!config) {
      config = await prisma.systemConfig.create({
        data: {
          automacaoAtiva,
        },
      });
    } else {
      config = await prisma.systemConfig.update({
        where: { id: config.id },
        data: {
          automacaoAtiva,
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Automação ${automacaoAtiva ? 'ativada' : 'desativada'} com sucesso`,
      config: {
        automacaoAtiva: config.automacaoAtiva,
        ultimaVerificacao: config.ultimaVerificacao,
      },
    });
  } catch (error) {
    console.error('Error updating config:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao atualizar configuração' },
      { status: 500 }
    );
  }
}