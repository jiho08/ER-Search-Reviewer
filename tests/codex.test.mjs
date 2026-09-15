import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { CodexRpc, runCodexReview, codexEnvironment } from "../scripts/codex/app-server.ts";
import { startCodexBridge } from "../scripts/codex/bridge.ts";
import { createDemoData } from "../lib/demo.ts";
import { createReview } from "../lib/server/reviewer.ts";
import { basicReview } from "../lib/server/review-tools.ts";
import { reviewWithCodex, toReviewMatch } from "../lib/server/codex-client.ts";

const matches = createDemoData().matches.slice(0, 3);
const fixture = fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url));
function rpc(scenario) { return new CodexRpc(process.cwd(), process.execPath, [fixture, scenario]); }

test("Codex account reviews execute real registered tools and use only final JSON", async () => {
  const result = await runCodexReview(matches, "survival", { cwd: process.cwd(), rpc: rpc("success") });
  assert.equal(result.title, "3경기 생존 리뷰");
  assert.deepEqual(result.trace.map((tool) => tool.name), ["get_recent_matches", "analyze_survival"]);
});

test("Codex rejects API-key auth, unknown capabilities, nonempty args and timed-out turns", async () => {
  for (const scenario of ["api-key", "unknown-tool", "bad-args", "timeout", "slow-init", "duplicate-tools"]) {
    await assert.rejects(runCodexReview(matches, "survival", {
      cwd: process.cwd(), rpc: rpc(scenario), timeoutMs: ["timeout", "slow-init"].includes(scenario) ? 100 : 2_000,
    }));
  }
  await assert.rejects(runCodexReview(matches, "survival", {
    cwd: process.cwd(), rpc: rpc("quota"),
  }), { status: 429 });
  const controller = new AbortController();
  const cancelled = runCodexReview(matches, "survival", {
    cwd: process.cwd(), rpc: rpc("timeout"), signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(cancelled, { status: 504 });
});

test("Codex process environment excludes project API keys and bridge credentials", () => {
  const values = codexEnvironment();
  assert.equal("OPENAI_API_KEY" in values, false);
  assert.equal("ER_API_KEY" in values, false);
  assert.equal("CODEX_BRIDGE_TOKEN" in values, false);
});

test("Codex selection never falls through to paid OpenAI API; demo requires explicit test", async () => {
  let codexCalls = 0;
  const dependencies = {
    provider: "codex", apiKey: "must-not-use",
    getPlayer: async (_nickname, source) => ({ ...createDemoData(), source }),
    fetcher: async () => { throw new Error("OpenAI must not be called"); },
    codexReviewer: async (records, focus) => { codexCalls++; return basicReview(records, focus); },
  };
  const request = { nickname: "테스트", source: "demo", focus: "survival", mode: "normal", character: "all" };
  assert.equal((await createReview(request, dependencies)).engine, "rules");
  assert.equal(codexCalls, 0);
  const result = await createReview({ ...request, codexTest: true }, dependencies);
  assert.equal(result.engine, "codex");
  assert.ok(result.limitations.some((line) => line.includes("가상")));
  assert.equal(codexCalls, 1);
  const failed = await createReview({ ...request, source: "live" }, {
    ...dependencies, codexReviewer: async () => { throw new Error("offline"); },
  });
  assert.equal(failed.engine, "rules");
  assert.ok(failed.limitations[0].includes("Codex 리뷰를 완료하지 못해"));
});

test("local bridge rejects unauthenticated, cross-origin, arbitrary and concurrent requests", async (t) => {
  const token = "local-test-token-".repeat(4);
  let finish;
  let signalStarted;
  const started = new Promise((resolve) => { signalStarted = resolve; });
  const server = await startCodexBridge({
    url: "http://127.0.0.1:0", token,
    status: async () => "ready",
    review: async (records, focus) => {
      assert.ok(records.every((record) => !("details" in record)), "image/UI metadata stays outside the model contract");
      signalStarted();
      await new Promise((resolve) => { finish = resolve; });
      return basicReview(records, focus);
    },
  });
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  assert.equal((await fetch(`${origin}/status`)).status, 403);
  assert.equal((await fetch(`${origin}/status`, { headers: { ...headers, Origin: "http://localhost:5173" } })).status, 403);
  assert.deepEqual(await (await fetch(`${origin}/status`, { headers })).json(), { status: "ready" });
  assert.equal((await fetch(`${origin}/review`, { method: "POST", headers, body: JSON.stringify({ prompt: "run a command" }) })).status, 400);
  const options = { method: "POST", headers, body: JSON.stringify({ focus: "survival", matches: matches.map(toReviewMatch) }) };
  const first = reviewWithCodex(matches, "survival", { url: origin, token });
  await started;
  assert.equal((await fetch(`${origin}/review`, options)).status, 429);
  finish();
  assert.ok((await first).title);
});
