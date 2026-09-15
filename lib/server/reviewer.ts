import { responseSchema, jsonSchema, reviewInstructions } from "./review-contract.ts";
import { filterMatches } from "../analysis.ts";
import { AppError } from "./errors.ts";
import { reviewWithCodex } from "./codex-client.ts";
import type { CodexConnection } from "./codex-client.ts";
import {
  basicReview,
  executeTool,
  reviewLimitations,
  selectTools,
  TOOL_REGISTRY,
} from "./review-tools.ts";
import type { ToolName } from "./review-tools.ts";
import type { ReviewRequest } from "./validation";
import type {
  DataSource,
  Match,
  PlayerData,
  ReviewResult,
  ToolTrace,
} from "../types";

interface ModelOutput {
  type: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: { type: string; text?: string }[];
}
interface ModelResponse {
  output?: ModelOutput[];
  status?: string;
}

async function aiReview(
  matches: Match[],
  request: ReviewRequest,
  key: string,
  model: string,
  fetcher: typeof fetch,
) {
  const trace: ToolTrace[] = [];
  const allowed = selectTools(request.focus);
  const tools = allowed.map((name) => ({
    type: "function",
    name,
    description: TOOL_REGISTRY[name].description,
    strict: true,
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  }));
  const input: unknown[] = [
    {
      role: "user",
      content: `리뷰 주제: ${request.focus}. 선택된 경기: ${matches.length}개. 도구로 기록을 확인하고 한국어로 분석하세요.`,
    },
  ];
  let calls = 0;
  for (let round = 0; round < 4; round++) {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 1800,
        instructions: reviewInstructions,
        input,
        tools,
        tool_choice:
          round === 0
            ? "required"
            : round === 3 || calls >= 6
              ? "none"
              : "auto",
        parallel_tool_calls: false,
        text: {
          format: {
            type: "json_schema",
            name: "play_review",
            strict: true,
            schema: jsonSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new AppError("AI 서비스 연결에 실패했습니다.", 502);
    const result = (await response.json()) as ModelResponse;
    if (!Array.isArray(result.output) || result.status === "incomplete")
      throw new AppError("AI 응답이 완성되지 않았습니다.", 502);
    const requested = result.output.filter(
      (item) => item.type === "function_call",
    );
    if (requested.length) {
      input.push(...result.output);
      for (const item of requested) {
        if (
          ++calls > 6 ||
          !item.call_id ||
          !allowed.includes(item.name as ToolName)
        )
          throw new AppError("AI 도구 요청 범위를 벗어났습니다.", 502);
        const args: unknown = JSON.parse(item.arguments || "{}");
        if (
          !args ||
          typeof args !== "object" ||
          Array.isArray(args) ||
          Object.keys(args).length
        )
          throw new AppError("AI 도구 인자가 올바르지 않습니다.", 502);
        const output = executeTool(item.name as ToolName, matches, trace);
        input.push({
          type: "function_call_output",
          call_id: item.call_id,
          output: JSON.stringify(output),
        });
      }
      continue;
    }
    if (!trace.length)
      throw new AppError("AI가 분석 근거를 조회하지 않았습니다.", 502);
    const text = result.output
      .flatMap((item) => item.content || [])
      .filter((part) => part.type === "output_text")
      .map((part) => part.text || "")
      .join("");
    return { ...responseSchema.parse(JSON.parse(text)), trace };
  }
  throw new AppError("AI 분석 단계를 완료하지 못했습니다.", 502);
}

interface ReviewDependencies {
  getPlayer: (nickname: string, source: DataSource, refresh?: boolean, options?: { seasonId?: number; historyId?: string; historyPages?: number }) => Promise<PlayerData>;
  apiKey?: string;
  model?: string;
  fetcher?: typeof fetch;
  provider?: "codex" | "openai" | "rules";
  codex?: CodexConnection;
  codexReviewer?: typeof reviewWithCodex;
}
export async function createReview(
  request: ReviewRequest,
  dependencies: ReviewDependencies,
): Promise<ReviewResult> {
  // Re-fetch on the server: never trust browser-supplied match numbers.
  const player = await dependencies.getPlayer(request.nickname, request.source, false, {
    seasonId: request.seasonId, historyId: request.historyId, historyPages: request.historyPages,
  });
  const selected = filterMatches(
    player.matches.filter((match) => request.seasonId === undefined || match.seasonId === request.seasonId),
    request.mode,
    request.character,
  );
  const matches = selected.slice(0, 100);
  if (!matches.length)
    throw new AppError("선택한 조건에 분석할 경기가 없습니다.", 422);
  const limitations = reviewLimitations(matches);
  if (selected.length > 100) limitations.unshift(`선택한 ${selected.length}경기 중 최근 100경기를 분석했습니다.`);
  if (player.season) limitations.unshift(`${player.season.name}에서 조회된 경기 기준이며, 시즌 전체 기록과 다를 수 있습니다.`);
  const base = {
    source: player.source,
    focus: request.focus,
    generatedAt: new Date().toISOString(),
  };
  if (player.source === "demo")
    limitations.unshift("가상 전적을 사용한 예시 분석입니다. 실제 경기 평가가 아닙니다.");
  if (dependencies.provider === "codex" && (player.source === "live" || request.codexTest)) {
    try {
      const review = await (dependencies.codexReviewer || reviewWithCodex)(
        matches, request.focus, dependencies.codex || {},
      );
      return { ...base, ...review, engine: "codex", limitations };
    } catch (error) {
      limitations.unshift(
        `Codex 리뷰를 완료하지 못해 기본 분석을 제공합니다. ${error instanceof AppError ? error.message : "Codex 연결 상태를 확인해 주세요."}`,
      );
    }
  }
  if (dependencies.provider !== "codex" && dependencies.provider !== "rules" && dependencies.apiKey?.trim() && player.source === "live") {
    try {
      const review = await aiReview(
        matches,
        request,
        dependencies.apiKey,
        dependencies.model || "gpt-4.1-mini",
        dependencies.fetcher || fetch,
      );
      return { ...base, ...review, engine: "openai", limitations };
    } catch {
      limitations.unshift(
        "AI 응답을 완료하지 못해 계산된 지표로 기본 분석을 제공했습니다. 서버의 AI 설정·사용 한도를 확인해 주세요.",
      );
    }
  }
  return {
    ...base,
    ...basicReview(matches, request.focus),
    engine: "rules",
    limitations,
  };
}
