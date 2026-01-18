const INTERVAL = Number(process.env.SCHEDULER_INTERVAL_MS || 60000);
const BASE_URL = process.env.BASE_URL;

if (!BASE_URL) {
  console.error("[Scheduler] BASE_URL não definida");
  process.exit(1);
}

let running = false;

console.log("[Scheduler] Iniciado com intervalo:", INTERVAL, "ms");
console.log("[Scheduler] BASE_URL:", BASE_URL);

async function tick() {
  if (running) return;
  running = true;

  try {
    // 1) verifica agendamentos (enfileira o que estiver no horário/dia)
    const resCheck = await fetch(`${BASE_URL}/api/emails/check-schedule`, {
      method: "POST",
    });
    const jsonCheck = await resCheck.json();
    console.log("[Scheduler] Check:", jsonCheck);

    // 2) processa 1 email por tick (1 por minuto)
    const resProcess = await fetch(`${BASE_URL}/api/emails/process`, {
      method: "POST",
    });
    const jsonProcess = await resProcess.json();
    console.log("[Scheduler] Process:", jsonProcess);
  } catch (err) {
    console.error("[Scheduler] Erro:", err);
  } finally {
    running = false;
  }
}

// dá 5s para o server subir
setTimeout(tick, 5000);
setInterval(tick, INTERVAL);
