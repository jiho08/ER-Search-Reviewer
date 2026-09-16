import type { DataSource, PlayerData, HistoryPage } from "../types";
import { nicknameSchema, seasonIdSchema, sourceSchema, historyCursorSchema, historyIdSchema, reviewRequestSchema } from "./validation.ts";
import { createReview } from "./reviewer.ts";
import { getCodexStatus } from "./codex-client.ts";
import { AppError, errorResponse } from "./errors.ts";
import { dailyAiLimit } from "./public-limits.ts";
import type { RequestKind } from "./public-limits.ts";

export interface AppEnvironment {
  APP_MODE?: string;
  ER_API_KEY?: string;
  AI_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  AI_DAILY_LIMIT?: string;
  CODEX_BRIDGE_URL?: string;
  CODEX_BRIDGE_TOKEN?: string;
}
export interface ApiServices {
  env: AppEnvironment;
  getPlayer: (nickname: string, source: DataSource, refresh?: boolean, options?: {
    seasonId?: number; historyId?: string; historyPages?: number;
  }) => Promise<PlayerData>;
  continueHistory: (id: string, cursor: string) => Promise<HistoryPage>;
  acquire?: (kind: RequestKind, request: Request, paid: boolean) => () => void;
}
const json = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store" } });

export function reviewProvider(env: AppEnvironment) {
  if (env.APP_MODE === "public") {
    if (env.AI_PROVIDER === "codex") throw new AppError("공개 서버에서는 로컬 Codex 리뷰를 사용할 수 없습니다.", 503);
    // An API key alone must never enable paid public reviews.
    return env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY?.trim() && dailyAiLimit(env.AI_DAILY_LIMIT) > 0 ? "openai" : "rules";
  }
  return env.AI_PROVIDER === "codex" ? "codex" : env.AI_PROVIDER === "rules" ? "rules" : "openai";
}

export async function readBoundedBody(request: Request) {
  // Drain small rejected payloads before replying so the development proxy can
  // reuse its upstream connection. Never buffer more than the 4 KiB app limit;
  // drain at most 64 KiB and spend at most five seconds reading the transport.
  if (Number(request.headers.get("content-length")) > 65_536) {
    await request.body?.cancel();
    throw new AppError("요청이 너무 큽니다.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AppError("요청 본문을 읽는 시간이 초과되었습니다.", 408)), 5_000);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      length += value.byteLength;
      if (length > 65_536) throw new AppError("요청이 너무 큽니다.", 413);
      if (length <= 4096) chunks.push(value);
    }
    if (length > 4096 || Number(request.headers.get("content-length")) > 4096)
      throw new AppError("요청이 너무 큽니다.", 413);
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("요청 형식을 확인해 주세요.", 400);
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readJsonBody(request: Request) {
  const body = await readBoundedBody(request);
  if (!request.headers.get("content-type")?.includes("application/json")) throw new AppError("JSON 요청이 필요합니다.", 415);
  try { return JSON.parse(body) as unknown; }
  catch { throw new AppError("요청 형식을 확인해 주세요.", 400); }
}

export function createApiHandlers(services: ApiServices) {
  const { env } = services;
  let localRunning = 0;
  let localWindow = 0;
  let localRequests = 0;
  function acquire(kind: RequestKind, request: Request, paid = false) {
    if (services.acquire) return services.acquire(kind, request, paid);
    if (env.APP_MODE === "public") throw new AppError("공개 서버의 공유 요청 제한 설정을 확인해 주세요.", 503);
    if (kind !== "review") return () => {};
    if (Date.now() - localWindow > 60_000) { localWindow = Date.now(); localRequests = 0; }
    if (localRunning >= 2 || localRequests >= 12) throw new AppError("분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    localRunning++; localRequests++;
    return () => { localRunning--; };
  }
  return {
    async player(request: Request) {
      let release: (() => void) | undefined;
      try {
        const query = new URL(request.url).searchParams;
        const source = sourceSchema.safeParse(query.get("source") || "live");
        const nickname = nicknameSchema.safeParse(query.get("nickname"));
        const season = query.has("season") ? seasonIdSchema.safeParse(Number(query.get("season"))) : null;
        if (!source.success || (source.data === "live" && !nickname.success) || (season && !season.success))
          throw new AppError("닉네임·조회 모드·시즌을 확인해 주세요.", 400);
        release = acquire("search", request);
        return json(await services.getPlayer(nickname.success ? nickname.data : "", source.data, query.get("refresh") === "1", {
          seasonId: season?.success ? season.data : undefined,
        }));
      } catch (error) { return errorResponse(error); } finally { release?.(); }
    },
    async history(request: Request) {
      let release: (() => void) | undefined;
      try {
        const query = new URL(request.url).searchParams;
        const id = historyIdSchema.safeParse(query.get("id"));
        const cursor = historyCursorSchema.safeParse(query.get("cursor"));
        if (!id.success || !cursor.success) throw new AppError("경기 조회 정보를 확인해 주세요.", 400);
        release = acquire("history", request);
        return json(await services.continueHistory(id.data, cursor.data));
      } catch (error) { return errorResponse(error); } finally { release?.(); }
    },
    async review(request: Request) {
      let release: (() => void) | undefined;
      try {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) throw new AppError("허용되지 않은 요청입니다.", 403);
        const parsed = reviewRequestSchema.safeParse(await readJsonBody(request));
        if (!parsed.success) throw new AppError("닉네임·모드·리뷰 주제를 확인해 주세요.", 400);
        const provider = reviewProvider(env);
        if (provider === "codex" && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname))
          throw new AppError("Codex 리뷰는 이 PC에서만 사용할 수 있습니다.", 403);
        if (env.APP_MODE === "public" && parsed.data.source === "live" && !parsed.data.historyId)
          throw new AppError("전적을 먼저 검색한 뒤 리뷰를 요청해 주세요.", 400);
        release = acquire("review", request, provider === "openai" && parsed.data.source === "live");
        return json(await createReview(parsed.data, {
          getPlayer: services.getPlayer, apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL, provider,
          codex: env.APP_MODE === "public" ? {} : { url: env.CODEX_BRIDGE_URL, token: env.CODEX_BRIDGE_TOKEN },
        }));
      } catch (error) { return errorResponse(error); } finally { release?.(); }
    },
    async config() {
      try {
        const aiProvider = reviewProvider(env);
        const codexStatus = aiProvider === "codex" ? await getCodexStatus({ url: env.CODEX_BRIDGE_URL, token: env.CODEX_BRIDGE_TOKEN }) : undefined;
        return json({
          gameApiConfigured: Boolean(env.ER_API_KEY?.trim()), aiProvider, codexStatus,
          aiConfigured: aiProvider === "codex" ? codexStatus === "ready" : aiProvider === "openai" && Boolean(env.OPENAI_API_KEY?.trim()),
        });
      } catch (error) { return errorResponse(error); }
    },
  };
}
