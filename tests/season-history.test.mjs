import { test } from "node:test";
import assert from "node:assert/strict";
import { createErClient, normalizeSeasons } from "../lib/server/er-api.ts";
import { dailyRPHistory } from "../lib/player-metrics.ts";
import { createReview } from "../lib/server/reviewer.ts";
import { createDemoData } from "../lib/demo.ts";
import { mergeMatches } from "../lib/season-history.ts";
import { reviewRequestSchema } from "../lib/server/validation.ts";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const seasonRows = [
  { seasonID: 39, isCurrent: 0, seasonStart: "2026-05-07 12:00:00", seasonEnd: "2026-08-06 09:00:00" },
  { seasonID: 40, isCurrent: 0, seasonStart: "2026-08-06 12:00:00", seasonEnd: "2026-08-13 12:00:00" },
  { seasonID: 41, isCurrent: 1, seasonStart: "2026-08-13 12:00:00", seasonEnd: "2026-11-12 09:00:00" },
];
const game = (id, seasonId = 41) => ({ gameId: id, seasonId, matchingMode: 3, matchingTeamMode: 3, gameRank: 1 });
function fixture(games) {
  const calls = [];
  const client = createErClient("fixture-key", async (url) => {
    calls.push(url);
    if (url.includes("/nickname")) return json({ code: 200, user: { userId: "fixture-id", nickname: "테스트" } });
    if (url.includes("/games/")) return games(new URL(url).searchParams.get("next"));
    if (url.includes("/data/Season")) return json({ code: 200, data: seasonRows });
    if (url.includes("/stats/")) {
      const seasonId = Number(new URL(url).pathname.split("/").at(-2));
      return json({ code: 200, userStats: [{ seasonId, matchingMode: 3, matchingTeamMode: 3, totalGames: 130, totalWins: 20, mmr: 7000 }] });
    }
    return json({ code: 200, data: {} });
  });
  return { client, calls };
}

test("season pagination passes 100 games, deduplicates, retries idempotently and stops before an earlier season", async () => {
  const { client, calls } = fixture((cursor) => {
    if (cursor === null) return json({ userGames: Array.from({ length: 50 }, (_, i) => game(400 - i)), next: 351 });
    if (cursor === "351") return json({ userGames: [game(351), ...Array.from({ length: 50 }, (_, i) => game(350 - i))], next: 301 });
    if (cursor === "301") return json({ userGames: [...Array.from({ length: 30 }, (_, i) => game(300 - i)), game(270, 40)], next: 270 });
    if (cursor === "270") return json({ userGames: [game(269, 40), game(268, 39)], next: 268 });
    throw new Error("must not fetch another season");
  });
  const player = await client.getPlayer("테스트");
  assert.equal(player.season.id, 41);
  const [one, duplicate] = await Promise.all([
    client.continueHistory(player.history.id, "351"), client.continueHistory(player.history.id, "351"),
  ]);
  assert.deepEqual(one, duplicate);
  assert.deepEqual(await client.continueHistory(player.history.id, "351"), one);
  assert.equal(calls.filter((url) => url.endsWith("?next=351")).length, 1);
  await client.continueHistory(player.history.id, "301");
  const end = await client.continueHistory(player.history.id, "270");
  assert.equal(end.history.exhausted, true);
  assert.equal(end.history.next, null);
  const full = client.getHistoryPlayer(player.history.id, "테스트", 41);
  assert.equal(full.matches.length, 130);
  assert.equal(full.matches[0].id, "400");
  assert.equal(full.matches.at(-1).id, "271");
  assert.ok(full.matches.every((match) => match.seasonId === 41));
  assert.equal((await client.getPlayer("테스트")).matches.length, 130);
  assert.equal(client.getHistoryPlayer(player.history.id, "테스트", 41, 1).matches.length, 50, "a paused UI must not review an in-flight page it has not received");
  assert.equal(client.getHistoryPlayer(player.history.id, "테스트", 41, 2).matches.length, 100);
  assert.throws(() => client.getHistoryPlayer(player.history.id, "테스트", 41, 99), { status: 409 });
  assert.throws(() => client.getHistoryPlayer(player.history.id, "다른사람", 41), { status: 409 });
  assert.throws(() => client.getHistoryPlayer(player.history.id, "테스트", 39), { status: 409 });
  await assert.rejects(() => client.continueHistory(player.history.id, "351"), { status: 409 });
});

test("pagination failure retains records/cursor, can resume and refuses a looping cursor", async () => {
  let attempts = 0;
  const { client } = fixture((cursor) => {
    if (!cursor) return json({ userGames: [game(400)], next: 400 });
    attempts++;
    if (attempts === 1) return json({}, 429);
    if (attempts === 2) return json({ userGames: [game(400)], next: 400 });
    return json({ userGames: [game(399)] });
  });
  const player = await client.getPlayer("테스트");
  await assert.rejects(() => client.continueHistory(player.history.id, "400"), { status: 429 });
  await assert.rejects(() => client.continueHistory(player.history.id, "400"), { status: 502 });
  assert.equal(client.getHistoryPlayer(player.history.id, "테스트").matches.length, 1);
  assert.equal(client.getHistoryPlayer(player.history.id, "테스트").history.next, "400");
  const end = await client.continueHistory(player.history.id, "400");
  assert.equal(end.history.exhausted, true);
  assert.equal(client.getHistoryPlayer(player.history.id, "테스트").matches.length, 2);
});

test("historical season selection queries its cumulative stats and skips newer season games", async () => {
  const { client, calls } = fixture((cursor) => cursor === null
    ? json({ userGames: [game(400, 41)], next: 400 })
    : json({ userGames: [game(300, 40), game(299, 39)] }));
  const player = await client.getPlayer("테스트", false, 40);
  assert.equal(player.season.isCurrent, false);
  assert.equal(player.ranked.seasonId, 40);
  assert.equal(player.matches.length, 0);
  const end = await client.continueHistory(player.history.id, "400");
  assert.deepEqual(end.matches.map((match) => match.id), ["300"]);
  assert.ok(calls.some((url) => url.endsWith("/stats/uid/fixture-id/40/3")));
  await assert.rejects(() => client.getPlayer("테스트", false, 999), { status: 422 });
});

test("whole season charts include season start, close historical seasons and preserve null gaps", () => {
  const demo = createDemoData();
  const season = normalizeSeasons(seasonRows)[0];
  const points = dailyRPHistory(demo.matches, { seasonId: 41, days: "season", asOf: demo.fetchedAt, ...season });
  assert.equal(points[0].date, "2026-08-13");
  assert.equal(points.at(-1).date, "2026-09-14");
  assert.equal(points[0].rp, null);
  const history = dailyRPHistory([], { seasonId: 39, days: "season", asOf: demo.fetchedAt, startDate: "2026-05-07", endDate: "2026-08-06" });
  assert.equal(history.length, 92);
  assert.equal(history.at(-1).date, "2026-08-06");
  assert.ok(history.every((point) => point.rp === null));
  assert.deepEqual(mergeMatches([{ ...demo.matches[0], id: "9007199254740993", startedAt: null }], [{ ...demo.matches[0], id: "9007199254740992", startedAt: null }]).map((match) => match.id), ["9007199254740993", "9007199254740992"]);
});

test("review keeps selected season and snapshot, limits the Codex sample to 100 and labels the limit", async () => {
  const demo = createDemoData();
  const historyId = "11111111-1111-4111-8111-111111111111";
  const request = reviewRequestSchema.parse({ nickname: demo.nickname, source: "live", seasonId: 41, historyId, historyPages: 15 });
  const player = { ...demo, source: "live", matches: [
    { ...demo.matches[0], seasonId: 39 },
    ...Array.from({ length: 150 }, (_, i) => ({ ...demo.matches[0], id: String(1000 - i) })),
  ] };
  const review = await createReview(request, {
    provider: "codex",
    getPlayer: async (nickname, source, refresh, options) => {
      assert.deepEqual(options, { seasonId: 41, historyId, historyPages: 15 });
      return player;
    },
    codexReviewer: async (matches) => {
      assert.equal(matches.length, 100);
      assert.ok(matches.every((match) => match.seasonId === 41));
      return { title: "검증", summary: "검증", observations: [], trace: [] };
    },
  });
  assert.equal(review.engine, "codex");
  assert.ok(review.limitations.some((text) => text.includes("150경기 중 최근 100경기")));
});
