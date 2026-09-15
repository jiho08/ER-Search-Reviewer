import assert from "node:assert/strict";
const origin = process.argv[2] || "http://localhost:5173";
async function read(path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    ...options,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}
const config = await read("/api/config");
assert.equal(config.status, 200);
assert.equal(typeof config.data.gameApiConfigured, "boolean");
const demo = await read("/api/player?source=demo");
assert.equal(demo.status, 200);
assert.equal(demo.data.source, "demo");
assert.equal(demo.data.matches.length, 20);
assert.equal(demo.data.ranked.seasonId, 41);
assert.equal(demo.data.season.id, 41);
assert.equal(demo.data.seasons[0].startDate, "2026-08-13");
assert.ok(demo.data.ranked.rp > 0);
assert.equal(demo.data.matches[0].details.equipment.length, 5);
assert.equal(typeof demo.data.matches[0].details.vision, "number");
assert.equal(typeof demo.data.matches[0].details.animalDamage, "number");
assert.equal(demo.data.matches[3].details.escapeState, 3);
assert.equal(demo.data.matches[7].details.escapeState, 2);
assert.equal(demo.data.matches[0].details.rpAfter, demo.data.ranked.rp);
assert.equal((await read("/api/player?nickname=&source=live")).status, 400);
assert.equal((await read("/api/player?source=demo&season=-1")).status, 400);
assert.equal((await read("/api/player/history?id=bad&cursor=1")).status, 400);
assert.equal((await read("/api/player/history?id=11111111-1111-4111-8111-111111111111&cursor=1")).status, 409);
if (!config.data.gameApiConfigured)
  assert.equal(
    (await read("/api/player?nickname=test&source=live")).status,
    503,
  );
const body = {
  nickname: demo.data.nickname,
  source: "demo",
  mode: "normal",
  character: "all",
  focus: "survival",
  seasonId: 41,
};
const options = {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify(body),
};
const review = await read("/api/review", options);
assert.equal(review.status, 200);
assert.equal(review.data.engine, "rules");
assert.ok(review.data.summary.includes("3경기"));
assert.deepEqual(
  review.data.trace.map((t) => t.name),
  ["get_recent_matches", "analyze_survival"],
);
assert.equal(
  (await read("/api/review", { ...options, body: "not json" })).status,
  400,
);
assert.equal(
  (
    await read("/api/review", {
      ...options,
      headers: { ...options.headers, Origin: "https://example.invalid" },
    })
  ).status,
  403,
);
console.log(
  "PASS: config, demo records, validation, missing key, filtered review, tool trace, malformed JSON, cross-origin rejection",
);
