const BASE_URL = process.env.BASE_URL;

const INTERVAL = Number(process.env.SCHEDULER_ESCALA_INTERVAL_MS || 60000);

if (!BASE_URL) {
  console.error("[Scheduler-Escala] BASE_URL não definida");
  process.exit(1);
}

console.log("[Scheduler-Escala] Iniciado");
console.log("[Scheduler-Escala] BASE_URL:", BASE_URL);
console.log("[Scheduler-Escala] Interval:", INTERVAL, "ms");

let running = false;

async function tick() {
  if (running) return;
  running = true;

  try {
    const res = await fetch(`${BASE_URL}/api/escala/process`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("[Scheduler-Escala] HTTP", res.status, json);
    } else {
      console.log("[Scheduler-Escala] Tick:", json);
    }
  } catch (err) {
    console.error("[Scheduler-Escala] Erro:", err);
  } finally {
    running = false;
  }
}

setTimeout(tick, 5000);
setInterval(tick, INTERVAL);