const BASE_URL = process.env.BASE_URL;

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`[Scheduler] Env var ausente: ${name}`);
  return v;
}

function parseMs(name: string, fallback: number) {
  const raw = process.env[name];

  // aceita "600000" e também "600000 (10 min)" sem quebrar
  const n = raw ? Number(String(raw).trim().split(" ")[0]) : NaN;

  if (!Number.isFinite(n) || n < 1000) {
    console.warn(`[Scheduler] ${name} inválido (${raw}). Usando fallback ${fallback}ms`);
    return fallback;
  }

  return n;
}

const CHECK_INTERVAL = parseMs("SCHEDULER_CHECK_INTERVAL_MS", 10 * 60 * 1000); // 10 min
const PROCESS_INTERVAL = parseMs("SCHEDULER_PROCESS_INTERVAL_MS", 60 * 1000); // 1 min

if (!BASE_URL) {
  console.error("[Scheduler] BASE_URL não definida");
  process.exit(1);
}

let runningCheck = false;
let runningProcess = false;

console.log("[Scheduler] Iniciado");
console.log("[Scheduler] BASE_URL:", BASE_URL);
console.log("[Scheduler] CHECK_INTERVAL:", CHECK_INTERVAL, "ms");
console.log("[Scheduler] PROCESS_INTERVAL:", PROCESS_INTERVAL, "ms");

async function postWithTimeout(url: string, timeoutMs = 25000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { method: "POST", signal: controller.signal });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

async function checkSchedules() {
  if (runningCheck) return;
  runningCheck = true;

  try {
    const { ok, status, json } = await postWithTimeout(`${BASE_URL}/api/emails/check-schedule`);
    if (!ok) {
      console.error("[Scheduler] Check (HTTP)", status, json);
    } else {
      console.log("[Scheduler] Check:", json);
    }
  } catch (err) {
    console.error("[Scheduler] Check erro:", err);
  } finally {
    runningCheck = false;
  }
}

async function processQueue() {
  if (runningProcess) return;
  runningProcess = true;

  try {
    const { ok, status, json } = await postWithTimeout(`${BASE_URL}/api/emails/process`);
    if (!ok) {
      console.error("[Scheduler] Process (HTTP)", status, json);
    } else {
      console.log("[Scheduler] Process:", json);
    }
  } catch (err) {
    console.error("[Scheduler] Process erro:", err);
  } finally {
    runningProcess = false;
  }
}

// dá 5s para o server subir
setTimeout(() => {
  checkSchedules();
  processQueue();
}, 5000);

// ✅ 10 min: só enfileira
setInterval(checkSchedules, CHECK_INTERVAL);

// ✅ 1 min: só envia 1 pendente por vez
setInterval(processQueue, PROCESS_INTERVAL);