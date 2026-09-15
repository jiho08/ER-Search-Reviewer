import "./sites-env.mjs";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { envPath, startLocalCodex } from "./local-codex-env.mjs";

const bridge = await startLocalCodex();
const child = spawn(process.execPath, [
  fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)),
  "dev", "--config", "dist/server/wrangler.json", "--local",
  "--persist-to", ".wrangler/state", "--ip", "127.0.0.1", "--inspector-port", "0",
  ...(existsSync(envPath) ? ["--env-file", envPath] : []),
  ...process.argv.slice(2),
], { stdio: "inherit", windowsHide: true, shell: false });
child.on("error", () => { bridge?.close(); process.exitCode = 1; });
child.on("exit", (code) => { bridge?.close(); process.exit(code ?? 1); });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => { child.kill(); bridge?.close(); });
