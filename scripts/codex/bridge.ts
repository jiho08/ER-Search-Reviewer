import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { AppError } from "../../lib/server/errors.ts";
import { getAccountStatus, runCodexReview } from "./app-server.ts";

const metric = z.number().finite().nonnegative().nullable();
export const bridgeRequestSchema = z.object({
  focus: z.enum(["overall", "combat", "survival", "character"]),
  matches: z.array(z.object({
    id: z.string().regex(/^(?:demo-)?\d+$/).max(24),
    characterCode: z.number().int().nonnegative(), characterName: z.string().max(100),
    mode: z.number().int().nonnegative(), teamMode: z.number().int().nonnegative(),
    seasonId: metric, startedAt: z.string().datetime().nullable(),
    rank: z.number().finite().min(1).nullable(),
    kills: metric, deaths: metric, assists: metric, damage: metric, damageTaken: metric,
    hunting: metric, duration: metric, mmrGain: z.number().finite().nullable(),
  }).strict()).min(1).max(100),
}).strict();

export async function startCodexBridge(options: {
  url: string; token: string; model?: string;
  review?: typeof runCodexReview; status?: typeof getAccountStatus;
}) {
  const url = new URL(options.url);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" ||
    !url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("CODEX_BRIDGE_URL must be http://127.0.0.1:<port>");
  if (options.token.length < 32) throw new Error("CODEX_BRIDGE_TOKEN must contain at least 32 characters");
  const token = Buffer.from(`Bearer ${options.token}`);
  const cwd = fileURLToPath(new URL("../../.sites-runtime/codex-review/", import.meta.url));
  mkdirSync(cwd, { recursive: true });
  let busy = false, windowStart = Date.now(), requests = 0;
  const active = new Set<AbortController>();
  const server = createServer(async (request, response) => {
    const send = (status: number, body: unknown) => {
      if (response.destroyed) return;
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(body));
    };
    const auth = Buffer.from(request.headers.authorization || "");
    if (request.headers.origin || request.headers.host !== url.host ||
      auth.length !== token.length || !timingSafeEqual(auth, token)) {
      send(403, { error: "Forbidden" }); return;
    }
    try {
      if (request.url === "/status" && request.method === "GET") {
        const status = await (options.status || getAccountStatus)(cwd);
        send(200, { status }); return;
      }
      if (request.url !== "/review" || request.method !== "POST") {
        send(404, { error: "Not found" }); return;
      }
      if (!request.headers["content-type"]?.startsWith("application/json")) {
        send(415, { error: "JSON required" }); return;
      }
      if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); requests = 0; }
      if (busy || requests >= 6) { send(429, { error: "Busy" }); return; }
      busy = true;
      const controller = new AbortController();
      active.add(controller);
      response.once("close", () => { if (!response.writableEnded) controller.abort(); });
      try {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 100_000) { send(413, { error: "Payload too large" }); return; }
          chunks.push(chunk);
        }
        let body: unknown;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { send(400, { error: "Invalid JSON" }); return; }
        const parsed = bridgeRequestSchema.safeParse(body);
        if (!parsed.success) { send(400, { error: "Invalid match data" }); return; }
        requests++;
        const review = await (options.review || runCodexReview)(parsed.data.matches, parsed.data.focus, { cwd, model: options.model, signal: controller.signal });
        send(200, review);
      } finally { active.delete(controller); busy = false; }
    } catch (error) {
      send(error instanceof AppError ? error.status : 503, { error: "Codex connection failed" });
    }
  });
  server.requestTimeout = 190_000;
  server.headersTimeout = 10_000;
  const close = server.close.bind(server);
  server.close = (callback) => {
    for (const controller of active) controller.abort();
    return close(callback);
  };
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(url.port), "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address && typeof address !== "string") url.port = String(address.port);
  return server;
}
