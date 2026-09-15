import assert from "node:assert/strict";

// Explicit opt-in integration check: consumes the signed-in Codex account quota.
const origin = process.argv[2] || "http://localhost:5173";
const config = await (await fetch(`${origin}/api/config`)).json();
assert.equal(config.aiProvider, "codex", "AI_PROVIDER must be codex");
assert.equal(config.codexStatus, "ready", "Codex ChatGPT login must be ready");
const response = await fetch(`${origin}/api/review`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({ nickname: "루미아연구원", source: "demo", mode: "normal", character: "all", focus: "survival", codexTest: true }),
  signal: AbortSignal.timeout(190_000),
});
assert.equal(response.status, 200);
const result = await response.json();
assert.equal(result.engine, "codex", "Codex must return a real review, not basic fallback");
assert.equal(result.source, "demo");
assert.ok(result.trace.some((tool) => tool.name === "get_recent_matches"));
assert.ok(result.trace.some((tool) => tool.name === "analyze_survival"));
assert.ok(result.limitations.some((line) => line.includes("가상")));
console.log(JSON.stringify({ status: "PASS", engine: result.engine, title: result.title, summary: result.summary, tools: result.trace.map((tool) => tool.name) }, null, 2));
