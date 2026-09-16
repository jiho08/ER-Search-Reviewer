import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryStore, sqliteStore } from "../lib/server/state-store.ts";
import { createErClient } from "../lib/server/er-api.ts";
import { createRequestGate } from "../lib/server/request-gate.ts";
import { createPublicLimits, dailyAiLimit } from "../lib/server/public-limits.ts";
import { createApiHandlers, reviewProvider } from "../lib/server/api-handlers.ts";
import { createDemoData } from "../lib/demo.ts";

// Run the production SQL statements against a real SQLite database. The adapter
// exposes just DurableObjectStorage's synchronous SQL/transaction operations.
function storage(db) {
  return {
    sql: { exec: (query, ...values) => { const rows = db.prepare(query).all(...values); return { toArray: () => rows }; } },
    transactionSync: (operation) => {
      db.exec("BEGIN");
      try { const result = operation(); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
}
const json = (body) => Response.json(body);
function fixtureFetcher(calls) {
  return async (url) => {
    calls.push(url);
    if (url.includes("/nickname")) return json({ user: { userId: "fixture-user", nickname: "테스트" } });
    if (url.includes("/data/Season")) return json({ data: [{ seasonID: 41, isCurrent: 1 }] });
    if (url.includes("/games/")) return json({ userGames: [{ gameId: url.includes("?next=") ? 99 : 100, seasonId: 41 }], ...(url.includes("?next=") ? {} : { next: 100 }) });
    return json({ data: {} });
  };
}
function er(store, calls, options = {}) {
  return createErClient("fixture-key", fixtureFetcher(calls), {
    store, gate: createRequestGate(store, { intervalMs: 0 }), refreshCooldown: true, ...options,
  });
}

test("SQLite history survives process recreation, preserves acknowledged pages and deduplicates refresh/retry", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "lumia-state-test-"));
  const file = join(dir, "state.sqlite");
  const calls = [];
  let db = new DatabaseSync(file);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const one = er(sqliteStore(storage(db)), calls);
  const [player, duplicate] = await Promise.all([one.getPlayer("테스트"), one.getPlayer("테스트", true)]);
  assert.equal(player.history.id, duplicate.history.id);
  assert.equal(calls.filter((url) => url.includes("/nickname")).length, 1);
  db.close();
  db = new DatabaseSync(file);
  const store = sqliteStore(storage(db));
  const two = er(store, calls);
  const page = await two.continueHistory(player.history.id, "100");
  const three = er(store, calls);
  assert.deepEqual(await three.continueHistory(player.history.id, "100"), page);
  assert.equal(calls.filter((url) => url.includes("?next=")).length, 1);
  assert.equal(three.getHistoryPlayer(player.history.id, "테스트", 41, 1).matches.length, 1);
  assert.equal(three.getHistoryPlayer(player.history.id, "테스트", 41, 2).matches.length, 2);
  assert.equal((await three.getPlayer("테스트", true)).matches.length, 2);
  assert.equal(calls.filter((url) => url.includes("/nickname")).length, 1);
  assert.throws(() => three.getHistoryPlayer(player.history.id, "다른사람"), { status: 409 });
  const entry = store.get(`history:${player.history.id}`);
  store.set(`history:${player.history.id}`, { ...entry, until: 0 });
  three.prune();
  assert.equal(store.keys(`page:${player.history.id}:`).length, 0);
  assert.throws(() => three.getHistoryPlayer(player.history.id, "테스트"), { status: 409 });
  const fresh = await three.getPlayer("테스트");
  assert.notEqual(fresh.history.id, player.history.id, "an evicted history must not leave a stale search cache hit");
});

test("a failed atomic page write leaves the old cursor available for retry", async () => {
  const store = memoryStore();
  const client = er(store, []);
  const player = await client.getPlayer("테스트");
  const set = store.set;
  store.set = (key, value) => {
    if (key.startsWith("history:") && value.player.history.pages === 2) throw new Error("disk failure");
    return set(key, value);
  };
  await assert.rejects(client.continueHistory(player.history.id, "100"), /disk failure/);
  assert.equal(store.keys(`page:${player.history.id}:`).length, 1);
  store.set = set;
  assert.equal((await client.continueHistory(player.history.id, "100")).history.pages, 2);
});

test("global ER start spacing survives recreation and bounds its wait queue", async () => {
  const store = memoryStore();
  let time = 10000;
  const starts = [];
  const options = { now: () => time, sleep: async (ms) => { time += ms; }, maxPending: 2 };
  const first = createRequestGate(store, options);
  const record = async () => { starts.push(time); };
  const a = first(record), b = first(record);
  await assert.rejects(first(record), { status: 429 });
  await Promise.all([a, b]);
  const second = createRequestGate(store, options);
  await assert.rejects(second(async () => { starts.push(time); throw new Error("upstream"); }));
  await second(record);
  assert.deepEqual(starts, [10000, 11100, 12200, 13300]);
});

test("review leases and daily reservations persist; failed attempts are not refunded and reset at UTC midnight", () => {
  const store = memoryStore();
  let time = Date.parse("2026-09-16T23:59:00Z");
  const one = createPublicLimits(store, 2, () => time);
  const release1 = one.acquire("review", "a", true);
  const release2 = createPublicLimits(store, 2, () => time).acquire("review", "b", true);
  assert.throws(() => one.acquire("review", "c", true), { status: 429 });
  release1(); release2();
  assert.throws(() => one.acquire("review", "c", true), { status: 429, retryAfter: 60 });
  assert.equal(store.get("limit:ai:daily").count, 2);
  time += 60_000;
  one.acquire("review", "c", true)();
  assert.equal(store.get("limit:ai:daily").count, 1);
  one.acquire("review", "d")();
  assert.equal(store.get("limit:ai:daily").count, 1, "rules/demo requests do not consume paid reservations");
  const abandoned = createPublicLimits(store, 0, () => time);
  abandoned.acquire("review", "e"); abandoned.acquire("review", "f");
  time += 300_001;
  abandoned.acquire("review", "g")();
  assert.throws(() => abandoned.acquire("review", "h", true), { status: 429 });
});

test("search limits cannot be bypassed by rebuilding the limiter or switching IPs past the global cap", () => {
  const store = memoryStore();
  for (let i = 0; i < 6; i++) createPublicLimits(store, 0).acquire("search", "same")();
  assert.throws(() => createPublicLimits(store, 0).acquire("search", "same"), { status: 429 });
  for (let i = 0; i < 14; i++) createPublicLimits(store, 0).acquire("search", `new-${i}`)();
  assert.throws(() => createPublicLimits(store, 0).acquire("search", "another"), { status: 429 });
});

test("public AI requires explicit provider, key and positive daily limit; Codex is refused", () => {
  const env = { APP_MODE: "public", OPENAI_API_KEY: "fixture-key" };
  assert.equal(reviewProvider(env), "rules");
  assert.equal(reviewProvider({ ...env, AI_PROVIDER: "openai" }), "rules");
  assert.equal(reviewProvider({ ...env, AI_PROVIDER: "openai", AI_DAILY_LIMIT: "2" }), "openai");
  assert.throws(() => reviewProvider({ ...env, AI_PROVIDER: "codex" }), { status: 503 });
  assert.equal(dailyAiLimit("-1"), 0);
  assert.equal(dailyAiLimit("NaN"), 0);
});

test("HTTP handlers validate public requests, bound streaming bodies, hide credentials and preserve local demo reviews", async () => {
  let calls = 0;
  const api = createApiHandlers({
    env: { APP_MODE: "public", AI_PROVIDER: "rules", ER_API_KEY: "never-return-this" },
    getPlayer: async () => { calls++; return createDemoData(); },
    continueHistory: async () => { throw new Error("unused"); },
    acquire: () => () => {},
  });
  const request = (body, headers = {}) => new Request("https://example.com/api/review", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.equal((await api.review(request({ nickname: "테스트", source: "live" }))).status, 400);
  assert.equal((await api.review(request({ nickname: "테스트", source: "demo" }, { origin: "https://other.test" }))).status, 403);
  assert.equal(calls, 0);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4097)); controller.close(); } });
  assert.equal((await api.review(new Request("https://example.com/api/review", { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" }))).status, 413);
  let drained = false;
  const oversized = new ReadableStream({ pull(controller) { drained = true; controller.enqueue(new Uint8Array(4097)); controller.close(); } });
  assert.equal((await api.review(new Request("https://example.com/api/review", {
    method: "POST", headers: { "content-type": "application/json", "content-length": "4097" }, body: oversized, duplex: "half",
  }))).status, 413);
  assert.equal(drained, true, "small rejected bodies are drained before returning an error");
  assert.equal((await (await api.review(request({ nickname: "테스트", source: "demo" }))).json()).engine, "rules");
  const config = await (await api.config()).text();
  assert.equal(config.includes("never-return-this"), false);
  const local = createApiHandlers({ env: { AI_PROVIDER: "rules" }, getPlayer: async () => createDemoData(), continueHistory: async () => { throw new Error("unused"); } });
  assert.equal((await (await local.review(request({ nickname: "테스트", source: "demo" }))).json()).engine, "rules");
  const unsafe = createApiHandlers({ env: { APP_MODE: "public" }, getPlayer: async () => { throw new Error("must not run"); }, continueHistory: async () => { throw new Error("must not run"); } });
  assert.equal((await unsafe.player(new Request("https://example.com/api/player?source=demo"))).status, 503);
});
