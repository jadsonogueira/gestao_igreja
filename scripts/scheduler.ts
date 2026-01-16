const INTERVAL = Number(process.env.SCHEDULER_INTERVAL_MS || 60000);
const BASE_URL = process.env.BASE_URL;

if (!BASE_URL) {
  console.error('[Scheduler] BASE_URL não definida');
  process.exit(1);
}

console.log('[Scheduler] Iniciado com intervalo:', INTERVAL, 'ms');

async function tick() {
  try {
    const res = await fetch(`${BASE_URL}/api/emails/process`, {
      method: 'POST',
    });

    const json = await res.json();
    console.log('[Scheduler] Tick:', json);
  } catch (err) {
    console.error('[Scheduler] Erro:', err);
  }
}

setInterval(tick, INTERVAL);