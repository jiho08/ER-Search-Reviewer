import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const envPath = fileURLToPath(new URL("../.env", import.meta.url));

export function loadLocalEnv() {
  if (!existsSync(envPath)) return;
  for (const [name, value] of Object.entries(parseEnv(readFileSync(envPath, "utf8"))))
    process.env[name] ??= value;
}

export function configureCodex() {
  let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const values = parseEnv(content);
  const updates = {
    AI_PROVIDER: "codex",
    CODEX_BRIDGE_URL: values.CODEX_BRIDGE_URL || "http://127.0.0.1:4318",
    CODEX_BRIDGE_TOKEN: values.CODEX_BRIDGE_TOKEN || randomBytes(32).toString("hex"),
  };
  for (const [name, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${name}=.*$`, "m");
    content = pattern.test(content) ? content.replace(pattern, `${name}=${value}`)
      : `${content}${content.endsWith("\n") || !content ? "" : "\n"}${name}=${value}\n`;
  }
  writeFileSync(envPath, content, { mode: 0o600 });
  loadLocalEnv();
}

export async function startLocalCodex() {
  loadLocalEnv();
  if (process.env.AI_PROVIDER !== "codex") return;
  if (!process.env.CODEX_BRIDGE_TOKEN) {
    configureCodex();
    // Empty values from the template must be replaced by the generated values.
    const values = parseEnv(readFileSync(envPath, "utf8"));
    process.env.CODEX_BRIDGE_TOKEN = values.CODEX_BRIDGE_TOKEN;
    process.env.CODEX_BRIDGE_URL ||= values.CODEX_BRIDGE_URL;
  }
  const { startCodexBridge } = await import("./codex/bridge.ts");
  const server = await startCodexBridge({
    url: process.env.CODEX_BRIDGE_URL || "http://127.0.0.1:4318",
    token: process.env.CODEX_BRIDGE_TOKEN,
    model: process.env.CODEX_MODEL,
  });
  console.log("LUMIA: 로컬 Codex 연결 서버가 준비되었습니다.");
  return server;
}
