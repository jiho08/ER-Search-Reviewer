import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mean,
  summarize,
  filterMatches,
  characterStats,
} from "../lib/analysis.ts";
import { createDemoData } from "../lib/demo.ts";
import {
  normalizeMatch,
  parseLocalization,
  createErClient,
} from "../lib/server/er-api.ts";
import { selectTools } from "../lib/server/review-tools.ts";
import { createReview } from "../lib/server/reviewer.ts";
import { reviewRequestSchema } from "../lib/server/validation.ts";

const demo = createDemoData();
const request = {
  source: "demo",
  nickname: demo.nickname,
  mode: "all",
  character: "all",
  focus: "overall",
};
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("missing metrics stay unknown while recorded zeroes remain valid", () => {
  assert.equal(mean([null, NaN]), null);
  assert.equal(mean([0, 10, null]), 5);
  assert.equal(summarize([]).winRate, null);
  assert.equal(
    summarize([{ ...demo.matches[0], rank: null }]).averageRank,
    null,
  );
});
test("rank, win rate and filters use the same selected sample", () => {
  const data = [
    { ...demo.matches[0], rank: 1 },
    { ...demo.matches[1], rank: 3 },
  ];
  assert.equal(summarize(data).averageRank, 2);
  assert.equal(summarize(data).winRate, 50);
  const normalAya = filterMatches(demo.matches, "normal", "2");
  assert.ok(normalAya.length);
  assert.ok(normalAya.every((m) => m.mode === 2 && m.characterCode === 2));
  assert.equal(
    characterStats(demo.matches).reduce((sum, c) => sum + c.count, 0),
    demo.matches.length,
  );
});
test("rank trend requires at least three records in both equal windows", () => {
  assert.equal(summarize(demo.matches.slice(0, 5)).rankChange, null);
  const data = [1, 1, 1, 4, 4, 4, 9].map((rank, i) => ({
    ...demo.matches[i],
    rank,
  }));
  assert.equal(summarize(data).rankChange, 3);
  assert.equal(
    summarize(
      [1, null, null, 8, null, null].map((rank, i) => ({
        ...demo.matches[i],
        rank,
      })),
    ).rankChange,
    null,
  );
});
test("normalization uses current documented fields, seconds, and nullable RP", () => {
  const match = normalizeMatch(
    {
      gameId: 123,
      characterNum: 2,
      characterCode: 99,
      playerAssistant: 7,
      playerDeaths: 0,
      playTime: 600,
      duration: 999999,
      gameRank: 0,
      startDtm: "2026-09-14T00:00:00Z",
    },
    { 2: "아야" },
  );
  assert.equal(match.characterName, "아야");
  assert.equal(match.assists, 7);
  assert.equal(match.deaths, 0);
  assert.equal(match.duration, 600);
  assert.equal(match.rank, null);
  assert.equal(match.mmrGain, null);
  assert.equal(normalizeMatch({ gameId: "bad" }), null);
  assert.equal(
    normalizeMatch({ gameId: 1, startDtm: "2026-09-14T00:00:00" }).startedAt,
    null,
  );
});
test("official localization parses U+2503 separator", () => {
  assert.deepEqual(
    parseLocalization(
      "Character/Name/2┃아야\r\nOther┃value\nCharacter/Name/6┃나딘",
    ),
    { 2: "아야", 6: "나딘" },
  );
});
test("live lookup uses string UID, encodes nickname, deduplicates and caches", async () => {
  const calls = [];
  const api = createErClient("test-key", async (url, init) => {
    calls.push(url);
    assert.equal(init.headers["x-api-key"], "test-key");
    if (url.includes("/nickname"))
      return response({
        code: 200,
        user: { uid: "uid-alpha", nickname: "테스트" },
      });
    if (url.includes("/games/uid/uid-alpha"))
      return response({
        code: 200,
        userGames: [
          ...Array.from({ length: 101 }, (_, i) => ({
            gameId: i + 1,
            characterNum: 2,
          })),
          { gameId: 42, characterNum: 2 },
        ],
      });
    return response({ code: 200, data: {} });
  });
  const player = await api.getPlayer("이름 & 문자");
  assert.ok(calls[0].includes(encodeURIComponent("이름 & 문자")));
  assert.equal(player.uid, "uid-alpha");
  assert.equal(player.source, "live");
  assert.equal(player.matches.length, 100);
  assert.equal(player.matches[0].id, "101");
  const count = calls.length;
  await api.getPlayer("이름 & 문자");
  assert.equal(calls.length, count);
  await api.getPlayer("이름 & 문자", true);
  assert.ok(calls.length > count);
});
test("missing key and upstream throttling produce explicit failures, never demo records", async () => {
  const noKey = createErClient("", async () => {
    throw new Error("must not fetch");
  });
  await assert.rejects(() => noKey.getPlayer("닉네임"), { status: 503 });
  const limited = createErClient("test", async () => response({}, 429));
  await assert.rejects(() => limited.getPlayer("닉네임"), { status: 429 });
});
test("review input rejects fabricated records and invalid focus values", () => {
  assert.equal(reviewRequestSchema.safeParse(request).success, true);
  assert.equal(
    reviewRequestSchema.safeParse({ ...request, matches: demo.matches })
      .success,
    false,
  );
  assert.equal(
    reviewRequestSchema.safeParse({ ...request, focus: "shell" }).success,
    false,
  );
});
test("topic selection changes registered tool execution and sample scope", async () => {
  assert.deepEqual(selectTools("combat"), [
    "get_recent_matches",
    "analyze_combat",
  ]);
  const result = await createReview(
    { ...request, focus: "survival", mode: "normal" },
    { getPlayer: async () => demo },
  );
  assert.equal(result.engine, "rules");
  assert.equal(result.source, "demo");
  assert.equal(result.observations.length, 1);
  assert.deepEqual(
    result.trace.map((t) => t.name),
    ["get_recent_matches", "analyze_survival"],
  );
  assert.ok(result.summary.includes("3경기"));
  assert.ok(result.limitations.some((line) => line.includes("가상")));
});
test("demo review never spends an AI call, even when an API key exists", async () => {
  const result = await createReview(request, {
    getPlayer: async () => demo,
    apiKey: "test-key",
    fetcher: async () => {
      throw new Error("must not call AI");
    },
  });
  assert.equal(result.engine, "rules");
  assert.equal(result.trace.length, 4);
});
test("empty filtered sample does not generate a review", async () => {
  await assert.rejects(
    () =>
      createReview(
        { ...request, character: "999" },
        { getPlayer: async () => demo },
      ),
    { status: 422 },
  );
});
test("AI function-call loop executes allowed tool and returns output by call_id", async () => {
  let count = 0;
  const result = await createReview(
    { ...request, source: "live", focus: "combat" },
    {
      getPlayer: async () => ({ ...demo, source: "live" }),
      apiKey: "test-key",
      fetcher: async (url, init) => {
        assert.equal(url, "https://api.openai.com/v1/responses");
        const body = JSON.parse(init.body);
        assert.equal(body.store, false);
        assert.equal(JSON.stringify(body).includes(demo.nickname), false);
        if (count++ === 0) {
          assert.equal(body.tool_choice, "required");
          return response({
            status: "completed",
            output: [
              {
                type: "function_call",
                call_id: "call-1",
                name: "analyze_combat",
                arguments: "{}",
              },
            ],
          });
        }
        const output = body.input.find(
          (item) => item.type === "function_call_output",
        );
        assert.equal(output.call_id, "call-1");
        assert.equal(JSON.parse(output.output).summary.count, 20);
        return response({
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    title: "교전 분석",
                    summary: "20경기의 기록입니다.",
                    observations: [
                      {
                        title: "기록 확인",
                        evidence: "평균 처치를 확인했습니다.",
                        action: "다음 교전을 기록하세요.",
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        });
      },
    },
  );
  assert.equal(result.engine, "openai");
  assert.equal(result.trace[0].name, "analyze_combat");
  assert.equal(count, 2);
});
test("AI failure and unregistered tool calls fall back to visibly labelled basic analysis", async () => {
  for (const mock of [
    () => response({}, 401),
    () =>
      response({
        output: [
          {
            type: "function_call",
            call_id: "bad",
            name: "run_shell",
            arguments: "{}",
          },
        ],
      }),
  ]) {
    const result = await createReview(
      { ...request, source: "live" },
      {
        getPlayer: async () => ({ ...demo, source: "live" }),
        apiKey: "test",
        fetcher: async () => mock(),
      },
    );
    assert.equal(result.engine, "rules");
    assert.ok(result.limitations[0].includes("AI 응답을 완료하지 못해"));
  }
});
