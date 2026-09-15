import { z } from "zod";
import { AppError } from "./errors.ts";
import { responseSchema } from "./review-contract.ts";
import { selectTools } from "./review-tools.ts";
import type { Match, ReviewFocus } from "../types";

export interface CodexConnection {
  url?: string;
  token?: string;
}
export type CodexStatus = "ready" | "login-required" | "unavailable";

function connection(config: CodexConnection) {
  if (!config.url || !config.token?.trim())
    throw new AppError("로컬 Codex 연결 서버를 먼저 실행해 주세요.", 503);
  const url = new URL(config.url);
  if (
    url.protocol !== "http:" || url.hostname !== "127.0.0.1" ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash
  ) throw new AppError("Codex 연결은 이 PC의 로컬 서버만 사용할 수 있습니다.", 503);
  return { url, headers: { Authorization: `Bearer ${config.token}` } };
}

export async function getCodexStatus(config: CodexConnection): Promise<CodexStatus> {
  try {
    const { url, headers } = connection(config);
    const response = await fetch(new URL("/status", url), {
      headers, signal: AbortSignal.timeout(8_000), redirect: "manual",
    });
    if (!response.ok) return "unavailable";
    const data = await response.json() as { status?: unknown };
    return data.status === "ready" || data.status === "login-required"
      ? data.status : "unavailable";
  } catch { return "unavailable"; }
}

const resultSchema = responseSchema.extend({
  trace: z.array(z.object({
    name: z.string(), label: z.string(), result: z.string(),
  }).strict()).min(1).max(6),
});

export async function reviewWithCodex(
  matches: Match[], focus: ReviewFocus, config: CodexConnection,
) {
  const { url, headers } = connection(config);
  let response: Response;
  try {
    response = await fetch(new URL("/review", url), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      // The local service accepts only validated match records, never arbitrary prompts.
      body: JSON.stringify({ matches: matches.map(toReviewMatch), focus }),
      signal: AbortSignal.timeout(185_000), redirect: "manual",
    });
  } catch {
    throw new AppError("Codex 연결이 끊겼거나 분석 시간이 초과되었습니다.", 503);
  }
  if (!response.ok) {
    if (response.status === 401)
      throw new AppError("터미널에서 codex login으로 ChatGPT 계정에 로그인해 주세요.", 503);
    if (response.status === 429)
      throw new AppError("Codex가 분석 중이거나 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.", 429);
    throw new AppError("Codex 리뷰를 완료하지 못했습니다. 연결 상태를 확인해 주세요.", 503);
  }
  const result = resultSchema.parse(await response.json());
  const allowed = selectTools(focus);
  if (result.trace.some((tool) => !allowed.some((name) => name === tool.name)))
    throw new AppError("Codex 분석 도구 응답이 올바르지 않습니다.", 502);
  return result;
}

// UI metadata is deliberately kept outside the local model's strict tool contract.
export function toReviewMatch(match: Match) {
  const { details, ...record } = match;
  void details;
  return record;
}
