import "./sites-env.mjs";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [action, ...extra] = process.argv.slice(2);
if (!["build", "preview", "check", "deploy"].includes(action)) throw new Error("Unknown public Worker action.");
// Do not inherit local .env/Codex settings, including accidental exported keys.
const env = { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" };
env.WRANGLER_REGISTRY_PATH = fileURLToPath(new URL("../.wrangler/public-dev-registry", import.meta.url));
env.MINIFLARE_REGISTRY_PATH = fileURLToPath(new URL("../.wrangler/public-registry", import.meta.url));
for (const key of ["ER_API_KEY", "OPENAI_API_KEY", "AI_PROVIDER", "APP_MODE", "AI_DAILY_LIMIT", "CODEX_BRIDGE_URL", "CODEX_BRIDGE_TOKEN", "CODEX_MODEL"]) delete env[key];
const config = fileURLToPath(new URL("../dist-public/server/wrangler.json", import.meta.url));
if (action !== "build") {
  if (!existsSync(config)) throw new Error("Run npm run build:public first.");
  const built = JSON.parse(readFileSync(config, "utf8"));
  if (built.vars?.APP_MODE !== "public" || !built.durable_objects?.bindings?.some((binding) => binding.name === "LUMIA_STATE"))
    throw new Error("The output is not a public Worker build.");
}
const cli = fileURLToPath(new URL(action === "build" ? "../node_modules/vite/bin/vite.js" : "../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const args = action === "build" ? ["build", "--config", "vite.public.config.ts"]
  : action === "preview" ? ["dev", "--config", config, "--local", "--ip", "127.0.0.1", "--port", "8788", "--inspector-port", "0", "--persist-to", ".wrangler/public-state", "--env-file", fileURLToPath(new URL("../cloudflare/public.env.example", import.meta.url))]
  : ["deploy", "--config", config, ...(action === "check" ? ["--dry-run"] : [])];
const child = spawn(process.execPath, [cli, ...args, ...extra], { env, stdio: "inherit", windowsHide: true, shell: false });
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill());
