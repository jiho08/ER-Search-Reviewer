import { createErClient } from "../lib/server/er-api.ts";
import { sqliteStore } from "../lib/server/state-store.ts";
import { createPublicLimits, dailyAiLimit } from "../lib/server/public-limits.ts";
import { createApiHandlers } from "../lib/server/api-handlers.ts";
import type { AppEnvironment } from "../lib/server/api-handlers.ts";
import { createDemoData } from "../lib/demo.ts";
import { errorResponse } from "../lib/server/errors.ts";

// One coordination domain for this site's one ER API key. UI/static requests
// stay at the edge; only API requests use this object and its SQLite storage.
export class LumiaState {
  private ctx: DurableObjectState;
  private api: ReturnType<typeof createApiHandlers>;
  private store: ReturnType<typeof sqliteStore>;
  private er: ReturnType<typeof createErClient>;
  private limits: ReturnType<typeof createPublicLimits>;
  private salt: Promise<CryptoKey>;

  constructor(ctx: DurableObjectState, env: AppEnvironment) {
    this.ctx = ctx;
    this.store = sqliteStore(ctx.storage);
    this.er = createErClient(env.ER_API_KEY ?? "", fetch, { store: this.store, maxHistories: 200, refreshCooldown: true });
    this.limits = createPublicLimits(this.store, dailyAiLimit(env.AI_DAILY_LIMIT));
    let secret = this.store.get<string>("privacy:salt");
    if (!secret) { secret = crypto.randomUUID(); this.store.set("privacy:salt", secret); }
    this.salt = crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    this.api = createApiHandlers({
      env: { ...env, APP_MODE: "public" },
      getPlayer: async (nickname, source, refresh, options = {}) => {
        if (source === "demo") return createDemoData();
        if (options.historyId) return this.er.getHistoryPlayer(options.historyId, nickname, options.seasonId, options.historyPages);
        return this.er.getPlayer(nickname, refresh, options.seasonId);
      },
      continueHistory: (id, cursor) => this.er.continueHistory(id, cursor),
      acquire: (kind, request, paid) => this.limits.acquire(kind, request.headers.get("x-lumia-client")!, paid),
    });
  }

  async fetch(request: Request) {
    try {
      const headers = new Headers(request.headers);
      // The edge replaces this header; the object has no publicly reachable URL.
      const ip = headers.get("x-lumia-client-ip") || "unknown";
      const digest = await crypto.subtle.sign("HMAC", await this.salt,
        new TextEncoder().encode(`${new Date().toISOString().slice(0, 10)}:${ip}`));
      headers.set("x-lumia-client", [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join(""));
      headers.delete("x-lumia-client-ip");
      const forwarded = new Request(request, { headers });
      const path = new URL(request.url).pathname.replace(/\/+$/, "");
      // Schedule before work, so interrupted requests still get cleaned up.
      if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + 1_800_000);
      if (path === "/api/config" && request.method === "GET") return this.api.config();
      if (path === "/api/player" && request.method === "GET") return this.api.player(forwarded);
      if (path === "/api/player/history" && request.method === "GET") return this.api.history(forwarded);
      if (path === "/api/review" && request.method === "POST") return this.api.review(forwarded);
      return Response.json({ error: "지원하지 않는 API 요청입니다." }, { status: 404 });
    } catch (error) { return errorResponse(error); }
  }

  async alarm() {
    this.store.transaction(() => { this.er.prune(); this.limits.prune(); });
    if (["history:", "cache:", "meta:", "limit:", "lease:"].some((prefix) => this.store.keys(prefix).length))
      await this.ctx.storage.setAlarm(Date.now() + 1_800_000);
  }
}
