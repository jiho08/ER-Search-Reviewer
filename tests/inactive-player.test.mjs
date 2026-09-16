import { test } from "node:test";
import assert from "node:assert/strict";
import { createErClient, normalizeRankedProfile } from "../lib/server/er-api.ts";
import { createApiHandlers } from "../lib/server/api-handlers.ts";
import { createRequestGate } from "../lib/server/request-gate.ts";
import { memoryStore } from "../lib/server/state-store.ts";

const json = (data, status = 200) => Response.json(data, { status });
const seasons = [
  { seasonID: 41, isCurrent: 1, seasonStart: "2026-08-13 12:00:00" },
  { seasonID: 39, isCurrent: 0, seasonStart: "2026-05-07 12:00:00", seasonEnd: "2026-08-06 09:00:00" },
];
function fixture(games, nickname = () => json({ user: { userId: "inactive-id", nickname: "이전시즌유저" } })) {
  const calls = [];
  const store = memoryStore();
  const client = createErClient("fixture-key", async (url) => {
    calls.push(url);
    if (url.includes("/nickname")) return nickname();
    if (url.includes("/games/")) return games(new URL(url).searchParams.get("next"));
    if (url.includes("/data/Season")) return json({ data: seasons });
    if (url.includes("/stats/")) return json({ userStats: url.endsWith("/39/3")
      ? [{ seasonId: 39, matchingMode: 3, matchingTeamMode: 3, totalGames: 80, totalWins: 9, mmr: 6100 }]
      : [] });
    if (url.includes("/rank/")) return url.endsWith("/39/3") ? json({ code: 404 }) : json({ userRank: { mmr: 0 } });
    return json({ data: {} });
  }, { store, gate: createRequestGate(store, { intervalMs: 0 }) });
  return { client, calls };
}

test("existing players without recent games can search and select historical cumulative stats", async () => {
  for (const missing of [() => json({ code: 404, message: "Not Found" }), () => json({}, 404)]) {
    const { client, calls } = fixture(missing);
    const api = createApiHandlers({
      env: { ER_API_KEY: "fixture-key", AI_PROVIDER: "rules" },
      getPlayer: (nickname, _source, refresh, options) => client.getPlayer(nickname, refresh, options?.seasonId),
      continueHistory: client.continueHistory,
    });
    const currentResponse = await api.player(new Request("https://example.test/api/player?nickname=" + encodeURIComponent("이전시즌유저")));
    assert.equal(currentResponse.status, 200);
    const current = await currentResponse.json();
    assert.equal(current.nickname, "이전시즌유저");
    assert.deepEqual(current.seasons.map(s => s.id), [41, 39]);
    assert.equal(current.season.id, 41);
    assert.equal(current.ranked.totalGames, 0);
    assert.equal(current.history.exhausted, true);
    assert.equal(current.history.next, null);
    assert.deepEqual(current.matches, []);

    const pastResponse = await api.player(new Request("https://example.test/api/player?nickname=" + encodeURIComponent("이전시즌유저") + "&season=39"));
    assert.equal(pastResponse.status, 200);
    const past = await pastResponse.json();
    assert.equal(past.season.id, 39);
    assert.equal(past.ranked.totalGames, 80);
    assert.equal(past.ranked.totalWins, 9);
    assert.equal(past.ranked.rp, 6100);
    assert.equal(past.rankedNotice, "");
    assert.deepEqual(past.matches, []);
    assert.equal(client.getHistoryPlayer(past.history.id, past.nickname, 39).ranked.totalGames, 80);
    assert.ok(calls.some(url => url.endsWith("/stats/uid/inactive-id/39/3")));
  }
});

test("empty season statistics mean no ranked records while missing or unrelated statistics remain unknown", () => {
  const season = { id: 41, name: "시즌 12" };
  const empty = normalizeRankedProfile(season, { userRank: { mmr: 0 } }, { userStats: [] });
  assert.equal(empty.totalGames, 0);
  assert.equal(empty.totalWins, 0);
  assert.equal(empty.averageTeamKills, null);
  assert.equal(normalizeRankedProfile(season, {}, {}).totalGames, null);
  assert.equal(normalizeRankedProfile(season, {}, { userStats: [{ seasonId: 39, matchingMode: 3, matchingTeamMode: 3, totalGames: 80 }] }).totalGames, null);
});

test("missing nicknames still fail and game authentication, rate limit and malformed responses are not hidden", async () => {
  const unknown = fixture(() => { throw new Error("games must not be requested"); }, () => json({ code: 404 }));
  await assert.rejects(() => unknown.client.getPlayer("없는유저"), { status: 404 });
  assert.equal(unknown.calls.length, 1);
  for (const [response, expected] of [
    [() => json({}, 403), 503], [() => json({}, 429), 429],
    [() => json({}, 500), 502], [() => json({ code: 200 }), 502],
  ]) {
    const { client } = fixture(response);
    await assert.rejects(() => client.getPlayer("이전시즌유저"), { status: expected });
  }
});

test("a missing final history page finishes pagination without losing acquired matches", async () => {
  for (const missing of [() => json({ code: 404 }), () => json({}, 404)]) {
    const { client } = fixture(cursor => cursor ? missing() : json({ userGames: [{ gameId: 100, seasonId: 41 }], next: 100 }));
    const player = await client.getPlayer("이전시즌유저");
    const end = await client.continueHistory(player.history.id, "100");
    assert.equal(end.history.exhausted, true);
    assert.equal(end.history.next, null);
    assert.equal(end.history.pages, 2);
    assert.deepEqual(end.matches, []);
    assert.deepEqual(await client.continueHistory(player.history.id, "100"), end);
    assert.deepEqual(client.getHistoryPlayer(player.history.id, player.nickname).matches.map(m => m.id), ["100"]);
  }
});
