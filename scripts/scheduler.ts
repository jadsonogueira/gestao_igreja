const CHECK_INTERVAL = Number(process.env.SCHEDULER_CHECK_INTERVAL_MS || 10 * 60 * 1000); // 10 min
const PROCESS_INTERVAL = Number(process.env.SCHEDULER_PROCESS_INTERVAL_MS || 60 * 1000); // 1 min

const BASE_URL = process.env.BASE_URL;

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

async function tickCheck() {
  if (runningCheck) return;
  runningCheck = true;

  try {
    const resCheck = await fetch(`${BASE_URL}/api/emails/check-schedule`, {
      method: "POST",
    });
    const jsonCheck = await resCheck.json();
    console.log("[Scheduler] Check:", jsonCheck);
  } catch (err) {
    console.error("[Scheduler] Check erro:", err);
  } finally {
    runningCheck = false;
  }
}

async function tickProcess() {
  if (runningProcess) return;
  runningProcess = true;

  try {
    const resProcess = await fetch(`${BASE_URL}/api/emails/process`, {
      method: "POST",
    });
    const jsonProcess = await resProcess.json();
    console.log("[Scheduler] Process:", jsonProcess);
  } catch (err) {
    console.error("[Scheduler] Process erro:", err);
  } finally {
    runningProcess = false;
  }
}

// dá 5s para o server subir
setTimeout(() => {
  tickCheck();
  tickProcess();
}, 5000);

setInterval(tickCheck, CHECK_INTERVAL);
setInterval(tickProcess, PROCESS_INTERVAL);