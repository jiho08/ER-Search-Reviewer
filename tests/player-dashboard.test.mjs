import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoData } from "../lib/demo.ts";
import { detailedStats, dailyRPHistory, matchOutcome } from "../lib/player-metrics.ts";
import { rankTier } from "../lib/rank-tier.ts";
import { currentSeason, normalizeMatch, normalizeRankedProfile, createErClient } from "../lib/server/er-api.ts";

const demo = createDemoData();
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("equipment, augments, credits, vision and scores use documented independent fields", () => {
  const m = normalizeMatch({ gameId: 12, characterLevel: 20, teamKill: 17, playerKill: 4, playerAssistant: 9,
    equipment: { 4: 204502, 1: 202503, 0: 117406, 5: 999999, bad: 1, 2: "201505", 3: 0 },
    traitFirstCore: 7000601, traitFirstSub: [7010701, null, "1"], traitSecondSub: [7110101],
    tacticalSkillGroup: 30, tacticalSkillLevel: 2, totalGainVFCredit: 1010,
    viewContribution: 0, addSurveillanceCamera: 40, damageToMonster: 18050, escapeState: 3,
    mmrBefore: 6900, mmrAfter: 6878, mmrGain: -22 });
  assert.deepEqual(m.details.equipment, [{ slot: 0, code: 117406 }, { slot: 1, code: 202503 }, { slot: 4, code: 204502 }]);
  assert.deepEqual(m.details.subTraits, [7010701, 7110101]);
  assert.equal(m.details.vision, 0);
  assert.equal(m.details.teamKills, 17);
  assert.equal(m.details.credits, 1010);
  assert.equal(m.details.animalDamage, 18050);
  assert.equal(m.details.escapeState, 3);
  assert.equal(m.details.rpAfter, 6878);
  assert.equal(m.mmrGain, -22);
  const missing = normalizeMatch({ gameId: 13, addSurveillanceCamera: 50, mmrGain: 42 });
  assert.equal(missing.details.vision, null);
  assert.equal(missing.details.rpAfter, null);
  assert.equal(missing.details.animalDamage, null);
  assert.equal(missing.details.escapeState, null);
  assert.deepEqual(missing.details.equipment, []);
});

test("new metrics exclude missing observations and retain recorded zero", () => {
  const sample = [
    { ...demo.matches[0], rank: 1, mmrGain: 20, details: { teamKills: 0, credits: 0, vision: 0, animalDamage: 0 } },
    { ...demo.matches[1], rank: 3, mmrGain: -15, details: { teamKills: 10, credits: 1000, vision: 20, animalDamage: 10000 } },
    { ...demo.matches[2], rank: null, mmrGain: null, details: undefined },
  ];
  const stats = detailedStats(sample);
  assert.equal(stats.averageTeamKills, 5);
  assert.equal(stats.averageCredits, 500);
  assert.equal(stats.averageVision, 10);
  assert.equal(stats.averageAnimalDamage, 5000);
  assert.equal(stats.top2, 50);
  assert.equal(stats.top3, 100);
  assert.equal(stats.rpGain, 5);
  assert.equal(stats.rpSamples, 2);
  assert.equal(detailedStats([]).averageTeamKills, null);
  assert.equal(detailedStats([]).top3, null);
  assert.equal(detailedStats([]).rpGain, null);
  assert.equal(detailedStats([]).averageAnimalDamage, null);
});

test("daily RP uses Korean date boundaries, the day's latest game and known gain samples", () => {
  const game = (startedAt, rpAfter, mmrGain) => ({ ...demo.matches[0], startedAt, details: { rpAfter }, mmrGain });
  const sample = [
    game("2026-09-12T16:00:00Z", 7040, -10),
    game("2026-09-12T14:59:59Z", 7000, 20),
    game("2026-09-12T15:00:00Z", 7050, 50),
    game("2026-09-13T01:00:00Z", null, null),
  ];
  const points = dailyRPHistory(sample, { seasonId: 41, days: 3, asOf: "2026-09-14T02:00:00Z" });
  assert.deepEqual(points, [
    { date: "2026-09-12", games: 1, gainGames: 1, rp: 7000, gain: 20 },
    { date: "2026-09-13", games: 3, gainGames: 2, rp: null, gain: 40 },
    { date: "2026-09-14", games: 0, gainGames: 0, rp: null, gain: null },
  ]);
  const complete = dailyRPHistory(sample.slice(0, 3), { days: 3, asOf: "2026-09-14T02:00:00Z" });
  assert.equal(complete[1].rp, 7040, "use latest by timestamp rather than input order or peak RP");
});

test("daily RP excludes other seasons, modes, unknown dates and dates outside selected period", () => {
  const base = { ...demo.matches[0], startedAt: "2026-09-13T00:00:00Z", details: { rpAfter: 7000 }, mmrGain: 0 };
  const sample = [
    { ...base, seasonId: null }, base, { ...base, mode: 2 }, { ...base, teamMode: 1 },
    { ...base, seasonId: 39 }, { ...base, startedAt: null },
    { ...base, startedAt: "2026-09-13T00:00:00" },
    { ...base, startedAt: "2026-09-10T00:00:00Z" },
    { ...base, startedAt: "2026-09-15T00:00:00Z" },
  ];
  const options = { days: 3, asOf: "2026-09-14T02:00:00Z" };
  const points = dailyRPHistory(sample, options);
  assert.equal(points.reduce((sum, point) => sum + point.games, 0), 1);
  assert.equal(points[1].gain, 0, "recorded zero is valid");
  assert.ok(dailyRPHistory(sample, { ...options, seasonId: 42 }).every((point) => point.games === 0));
  assert.deepEqual(dailyRPHistory([{ ...base, seasonId: null }], options), []);
  assert.equal(dailyRPHistory([base], { ...options, days: 7 }).length, 7);
  assert.equal(dailyRPHistory([base], { ...options, days: 90 }).length, 90);
});

test("match result colors preserve wins and distinguish escape failure from ordinary losses", () => {
  for (const [rank, escapeState, expected] of [
    [1, 0, "victory"], [1, 3, "victory"], [2, 0, "podium"], [3, 0, "podium"],
    [2, 3, "escape-success"], [6, 3, "escape-success"], [3, 1, "escape-failure"],
    [6, 2, "escape-failure"], [6, 0, "normal"], [6, 99, "normal"], [6, null, "normal"],
  ]) {
    const match = normalizeMatch({ gameId: 123, gameRank: rank, escapeState });
    assert.equal(matchOutcome(match), expected);
  }
});

test("current season requires an explicit unique flag rather than latest played ID", () => {
  assert.deepEqual(currentSeason([{ seasonID: 39, isCurrent: 0 }, { seasonID: 41, isCurrent: 1 }, { seasonID: 43, isCurrent: 0 }]), { id: 41, name: "시즌 12" });
  assert.equal(currentSeason([{ seasonID: 43 }]), null);
  assert.equal(currentSeason([{ seasonID: 41, isCurrent: 1 }, { seasonID: 43, isCurrent: 1 }]), null);
  assert.equal(currentSeason([{ seasonId: 41, isCurrent: 1 }]), null);
});

test("season rank normalization uses matching squad/season and a fractional percentile", () => {
  const statsData = { userStats: [
    { seasonId: 39, matchingMode: 3, matchingTeamMode: 3, mmr: 9999 },
    { seasonId: 41, matchingMode: 2, matchingTeamMode: 3, mmr: 1234 },
    { seasonId: 41, matchingMode: 3, matchingTeamMode: 3, mmr: 7030, totalGames: 20, totalWins: 0, totalTeamKills: 100, averageRank: 4, rank: 200, rankPercent: 0.0317 },
  ] };
  const rank = normalizeRankedProfile({ id: 41, name: "시즌 12" }, { userRank: { mmr: 7040, rank: 190, serverRank: 180, serverCode: 10 } }, statsData);
  assert.equal(rank.rp, 7040);
  assert.equal(rank.totalWins, 0);
  assert.equal(rank.averageTeamKills, 5);
  assert.equal(rank.serverRank, 180);
  assert.ok(Math.abs(rank.rankPercent - 3.17) < 0.00001);
  assert.equal(normalizeRankedProfile({ id: 43, name: "다음 시즌" }, {}, statsData).rp, null);
});

test("official current tier boundaries handle divisions without inventing elite promotion", () => {
  for (const [rp, name, division] of [[0, "아이언", 4], [599, "아이언", 1], [600, "브론즈", 4], [1400, "실버", 4], [2400, "골드", 4], [3600, "플래티넘", 4], [5000, "다이아몬드", 4], [6400, "메테오라이트", 4], [6700, "메테오라이트", 3], [7030, "메테오라이트", 2], [7599, "메테오라이트", 1]]) {
    assert.equal(rankTier(rp).name, name);
    assert.equal(rankTier(rp).division, division);
  }
  assert.equal(rankTier(7030).next, 270);
  assert.equal(rankTier(8500).name, "미스릴 이상");
  assert.equal(rankTier(null), null);
});

test("live player joins official current season, rank and stats while retaining games on rank failure", async () => {
  const calls = [];
  const api = createErClient("fixture-key", async (url) => {
    calls.push(String(url));
    if (url.includes("/nickname")) return json({ code: 200, user: { uid: "uid-rank", nickname: "전적테스트" } });
    if (url.includes("/user/games/")) return json({ code: 200, userGames: [{ gameId: 45, matchingMode: 3, matchingTeamMode: 3, seasonId: 41 }] });
    if (url.includes("/l10n/")) return json({ code: 200, data: {} });
    if (url.includes("/data/Season")) return json({ code: 200, data: [{ seasonID: 41, isCurrent: 1 }] });
    if (url.includes("/rank/uid/uid-rank/41/3")) return json({}, 500);
    if (url.includes("/stats/uid/uid-rank/41/3")) return json({ code: 200, userStats: [{ seasonId: 41, matchingMode: 3, matchingTeamMode: 3, mmr: 6400, totalGames: 10, totalWins: 2 }] });
    throw Error(`Unexpected endpoint: ${url}`);
  });
  const player = await api.getPlayer("전적테스트");
  assert.equal(player.ranked.seasonId, 41);
  assert.equal(player.ranked.rp, 6400);
  assert.equal(player.matches[0].seasonId, 41);
  assert.equal(player.matches.length, 1);
  assert.ok(player.rankedNotice.includes("일부"));
  assert.ok(calls.some((url) => url.includes("/v2/user/stats/uid/uid-rank/41/3")));
  const cachedCount = calls.length;
  await api.getPlayer("전적테스트");
  assert.equal(calls.length, cachedCount);
});
