import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

// POST - Verificar e processar agendamentos
export async function POST() {
  try {
    // Obter hora atual em São Paulo (UTC-3)
    const now = new Date();
    const saoPauloOffset = -3 * 60; // UTC-3 em minutos
    const saoPauloTime = new Date(now.getTime() + (saoPauloOffset - now.getTimezoneOffset()) * 60000);
    
    const currentHour = saoPauloTime.getHours();
    const currentMinute = saoPauloTime.getMinutes();
    const currentDayOfWeek = saoPauloTime.getDay(); // 0-6 (Domingo-Sábado)
    const currentDayOfMonth = saoPauloTime.getDate(); // 1-31
    const today = new Date(saoPauloTime.getFullYear(), saoPauloTime.getMonth(), saoPauloTime.getDate());

    console.log(`[Schedule Check] ${saoPauloTime.toISOString()} - Hora: ${currentHour}:${currentMinute}, Dia da semana: ${currentDayOfWeek}, Dia do mês: ${currentDayOfMonth}`);

    // Buscar todos os grupos ativos
    const groups = await prisma.messageGroup.findMany({
      where: { ativo: true },
    });

    const groupsToSend: string[] = [];

    for (const group of groups) {
      let shouldSend = false;

      // Verificar se já foi enviado hoje (evitar envio duplicado)
      if (group.ultimoEnvio) {
        const lastSendDate = new Date(group.ultimoEnvio);
        const lastSendDateOnly = new Date(lastSendDate.getFullYear(), lastSendDate.getMonth(), lastSendDate.getDate());
        
        if (lastSendDateOnly.getTime() === today.getTime()) {
          console.log(`[Skip] Grupo ${group.nomeGrupo} já foi enviado hoje`);
          continue;
        }
      }

      // Verificar se a hora corresponde (execução a cada hora)
      // O minuto não é mais verificado pois a execução é apenas 1x por hora
      if (group.horaEnvio !== currentHour) {
        continue;
      }

      // Verificar frequência específica
      switch (group.frequenciaEnvio) {
        case 'aniversario':
          // Aniversários são verificados diariamente no horário configurado
          shouldSend = true;
          console.log(`[Match] Grupo Aniversário - Hora: ${group.horaEnvio}h`);
          break;

        case 'diaria':
          // Enviar diariamente no horário configurado
          shouldSend = true;
          console.log(`[Match] Grupo ${group.nomeGrupo} (Diária) - Hora: ${group.horaEnvio}h`);
          break;

        case 'semanal':
          // Verificar se é o dia da semana correto
          if (group.diaSemana === currentDayOfWeek) {
            shouldSend = true;
            console.log(`[Match] Grupo ${group.nomeGrupo} (Semanal) - Dia: ${currentDayOfWeek}, Hora: ${group.horaEnvio}h`);
          }
          break;

        case 'mensal':
          // Verificar se é o dia do mês correto
          if (group.diaMes === currentDayOfMonth) {
            shouldSend = true;
            console.log(`[Match] Grupo ${group.nomeGrupo} (Mensal) - Dia: ${currentDayOfMonth}, Hora: ${group.horaEnvio}h`);
          }
          break;
      }

      if (shouldSend) {
        groupsToSend.push(group.nomeGrupo);
      }
    }

    // Processar grupos que devem ser enviados
    const results = [];
    for (const groupName of groupsToSend) {
      try {
        // Buscar membros do grupo
        let members: any[] = [];

        if (groupName === 'aniversario') {
          // Buscar membros com aniversário hoje
          const currentMonth = saoPauloTime.getMonth() + 1;
          const currentDay = saoPauloTime.getDate();

          members = await prisma.$queryRaw`
            SELECT id, nome, email, telefone FROM members 
            WHERE ativo = true 
            AND EXTRACT(MONTH FROM "dataNascimento") = ${currentMonth}
            AND EXTRACT(DAY FROM "dataNascimento") = ${currentDay}
          `;
        } else {
          // Buscar membros por grupo
          const groupFieldMap: Record<string, string> = {
            pastoral: 'grupoPastoral',
            devocional: 'grupoDevocional',
            visitantes: 'grupoVisitantes',
            membros_sumidos: 'grupoSumidos',
          };

          const field = groupFieldMap[groupName];
          if (field) {
            members = await prisma.member.findMany({
              where: {
                ativo: true,
                [field]: true,
              },
              select: { id: true, nome: true, email: true, telefone: true },
            });
          }
        }

        if (members.length === 0) {
          results.push({
            group: groupName,
            success: true,
            queued: 0,
            message: 'Nenhum membro encontrado',
          });
          console.log(`[Skip] Grupo ${groupName} - Nenhum membro encontrado`);
          continue;
        }

        // Criar logs de email (enfileirar)
        await prisma.emailLog.createMany({
          data: members.map((m: any) => ({
            grupo: groupName,
            membroId: m.id,
            membroNome: m.nome ?? '',
            membroEmail: m.email ?? null,
            status: 'pendente',
            dataAgendamento: new Date(),
          })),
        });
        
        // Atualizar último envio do grupo
        await prisma.messageGroup.updateMany({
          where: { nomeGrupo: groupName },
          data: { ultimoEnvio: new Date() },
        });

        results.push({
          group: groupName,
          success: true,
          queued: members.length,
        });

        console.log(`[Queued] Grupo ${groupName} - ${members.length} emails agendados`);
      } catch (error) {
        console.error(`[Error] Grupo ${groupName}:`, error);
        results.push({
          group: groupName,
          success: false,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: groupsToSend.length,
      results,
      timestamp: saoPauloTime.toISOString(),
    });
  } catch (error) {
    console.error('[Schedule Check Error]:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao verificar agendamentos',
      },
      { status: 500 }
    );
  }
}
