process.env.NODE_ENV = process.env.NODE_ENV || "production";
const { spawn } = require("child_process");
const port = process.env.PORT || "3001";
const child = spawn(
  process.execPath,
  [".\\node_modules\\next\\dist\\bin\\next", "start", "-p", port],
  { stdio: "inherit", shell: true, cwd: process.cwd() }
);
child.on("exit", (code) => process.exit(code ?? 0));
