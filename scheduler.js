#!/usr/bin/env node

/**
 * Verificador Automático de Agendamentos
 * 
 * Este script roda continuamente e verifica a cada minuto se há
 * grupos com envio programado para o horário atual.
 */

const APP_URL = process.env.APP_URL || 'https://igreja-gestao-membro-l1ymra.abacusai.app';
const CHECK_INTERVAL = 60 * 1000; // 1 minuto em milissegundos

let processing = false;

async function checkSchedules() {
  if (processing) {
    console.log('[Scheduler] Verificação anterior ainda em andamento, aguardando...');
    return;
  }

  processing = true;
  const now = new Date();
  
  try {
    console.log(`\n[Scheduler] ${now.toISOString()} - Verificando agendamentos...`);
    
    const response = await fetch(`${APP_URL}/api/emails/check-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (data.success) {
      if (data.processed > 0) {
        console.log(`[Scheduler] ✓ ${data.processed} grupo(s) processado(s)`);
        
        if (data.results) {
          data.results.forEach((result) => {
            if (result.success) {
              console.log(`  ✓ ${result.group}: ${result.queued} email(s) agendado(s)`);
              
              // Iniciar processamento da fila
              startProcessingQueue();
            } else {
              console.log(`  ✗ ${result.group}: ${result.error}`);
            }
          });
        }
      } else {
        console.log('[Scheduler] ○ Nenhum envio programado para este horário');
      }
    } else {
      console.error('[Scheduler] ✗ Erro:', data.error || data.message);
    }
  } catch (error) {
    console.error('[Scheduler] ✗ Erro ao verificar agendamentos:', error.message);
  } finally {
    processing = false;
  }
}

let queueProcessing = false;
let queueInterval = null;

async function startProcessingQueue() {
  if (queueInterval) {
    console.log('[Queue] Já há um processamento de fila em andamento');
    return;
  }

  console.log('[Queue] Iniciando processamento da fila de emails...');
  queueProcessing = true;

  const processOne = async () => {
    try {
      const response = await fetch(`${APP_URL}/api/emails/process`, {
        method: 'POST',
      });

      const data = await response.json();

      if (data.processed === 0) {
        console.log('[Queue] ✓ Fila de emails processada completamente');
        stopProcessingQueue();
      } else {
        console.log(`[Queue] ○ Processando... (${data.processed} restante(s))`);
      }
    } catch (error) {
      console.error('[Queue] ✗ Erro ao processar fila:', error.message);
      stopProcessingQueue();
    }
  };

  // Processar primeiro email imediatamente
  await processOne();

  // Continuar processando a cada 60 segundos
  queueInterval = setInterval(processOne, 60000);
}

function stopProcessingQueue() {
  if (queueInterval) {
    clearInterval(queueInterval);
    queueInterval = null;
  }
  queueProcessing = false;
}

// Tratamento de sinais para encerramento gracioso
process.on('SIGTERM', () => {
  console.log('\n[Scheduler] Recebido SIGTERM, encerrando...');
  stopProcessingQueue();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[Scheduler] Recebido SIGINT, encerrando...');
  stopProcessingQueue();
  process.exit(0);
});

// Iniciar o verificador
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   Verificador Automático de Agendamentos - Igreja App    ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`[Scheduler] URL da aplicação: ${APP_URL}`);
console.log(`[Scheduler] Intervalo de verificação: ${CHECK_INTERVAL / 1000} segundos`);
console.log('[Scheduler] Pressione Ctrl+C para encerrar');
console.log('');

// Executar verificação imediatamente ao iniciar
checkSchedules();

// Configurar verificações periódicas
setInterval(checkSchedules, CHECK_INTERVAL);
