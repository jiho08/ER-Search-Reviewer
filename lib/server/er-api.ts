import { AppError } from "./errors.ts";
import type { Match, PlayerData } from "../types";

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw =>
  !!v && typeof v === "object" && !Array.isArray(v);
const number = (v: unknown, min = 0): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min ? v : null;

export function normalizeMatch(
  raw: Raw,
  names: Record<number, string> = {},
): Match | null {
  if (
    (typeof raw.gameId !== "number" && typeof raw.gameId !== "string") ||
    !String(raw.gameId).match(/^\d+$/)
  )
    return null;
  const code = number(raw.characterNum) ?? 0;
  // Ambiguous timestamps have no documented timezone: do not invent one.
  const startedAt =
    typeof raw.startDtm === "string" &&
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw.startDtm) &&
    Number.isFinite(Date.parse(raw.startDtm))
      ? new Date(raw.startDtm).toISOString()
      : null;
  return {
    id: String(raw.gameId),
    characterCode: code,
    characterName: names[code] || `실험체 ${code}`,
    mode: number(raw.matchingMode) ?? 0,
    teamMode: number(raw.matchingTeamMode) ?? 0,
    seasonId: number(raw.seasonId),
    startedAt,
    rank: number(raw.gameRank, 1),
    kills: number(raw.playerKill),
    deaths: number(raw.playerDeaths),
    assists: number(raw.playerAssistant),
    damage: number(raw.damageToPlayer),
    damageTaken: number(raw.damageFromPlayer),
    hunting: number(raw.monsterKill),
    duration: number(raw.playTime),
    mmrGain: number(raw.mmrGain, -Infinity),
  };
}

export function parseLocalization(text: string): Record<number, string> {
  const result: Record<number, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^Character\/Name\/(\d+)┃(.+)$/);
    if (match) result[Number(match[1])] = match[2].trim();
  }
  return result;
}

export function createErClient(apiKey: string, fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { until: number; value: PlayerData }>();
  let nameCache: { until: number; value: Record<number, string> } | null = null;
  let lastRequest = 0;
  let chain = Promise.resolve();
  async function request(path: string): Promise<Raw> {
    if (!apiKey.trim())
      throw new AppError(
        "실제 전적 검색을 사용하려면 서버의 ER_API_KEY 설정이 필요합니다. 현재는 예시 모드를 이용할 수 있어요.",
        503,
      );
    // Serialize official API calls within this server instance. No assumed upstream quota.
    const previous = chain;
    let release!: () => void;
    chain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const wait = Math.max(0, 350 - (Date.now() - lastRequest));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      lastRequest = Date.now();
      const response = await fetcher(`https://open-api.bser.io${path}`, {
        headers: { "x-api-key": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.status === 429)
        throw new AppError(
          "전적 API 요청 한도에 도달했습니다. 잠시 후 다시 검색해 주세요.",
          429,
        );
      if (response.status === 401 || response.status === 403)
        throw new AppError(
          "전적 API 인증·접근 권한 또는 호출 제한을 확인해 주세요.",
          503,
        );
      if (response.status === 404)
        throw new AppError(
          "플레이어 또는 전적을 찾지 못했습니다. 현재 닉네임을 확인해 주세요.",
          404,
        );
      if (!response.ok)
        throw new AppError(
          "전적 제공 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.",
          502,
        );
      const data: unknown = await response.json();
      if (!isObject(data))
        throw new AppError("전적 API 응답 형식이 올바르지 않습니다.", 502);
      if (data.code === 404)
        throw new AppError("검색한 닉네임의 전적을 찾지 못했습니다.", 404);
      if (data.code === 429)
        throw new AppError(
          "전적 API 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
          429,
        );
      if (data.code !== undefined && data.code !== 200)
        throw new AppError(
          "전적 API가 요청을 처리하지 못했습니다. API 권한과 닉네임을 확인해 주세요.",
          502,
        );
      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "전적 서버 연결 시간이 초과되었거나 연결에 실패했습니다.",
        502,
      );
    } finally {
      release();
    }
  }
  async function characterNames(): Promise<Record<number, string>> {
    if (nameCache && nameCache.until > Date.now()) return nameCache.value;
    try {
      const metadata = await request("/v1/l10n/Korean");
      const path = isObject(metadata.data) ? metadata.data.l10Path : null;
      if (typeof path !== "string") return {};
      const url = new URL(path);
      const allowed = [
        "bser.io",
        "eternalreturn.io",
        "cloudfront.net",
        "amazonaws.com",
      ];
      if (
        url.protocol !== "https:" ||
        !allowed.some(
          (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
        )
      )
        return {};
      const response = await fetcher(url.href, {
        signal: AbortSignal.timeout(8_000),
        redirect: "error",
      });
      if (!response.ok) return {};
      const text = await response.text();
      if (text.length > 12_000_000) return {};
      const names = parseLocalization(text);
      nameCache = { until: Date.now() + 86_400_000, value: names };
      return names;
    } catch {
      return {};
    }
  }
  async function getPlayer(
    nickname: string,
    refresh = false,
  ): Promise<PlayerData> {
    const cached = cache.get(nickname);
    if (!refresh && cached && cached.until > Date.now()) return cached.value;
    const lookup = await request(
      `/v1/user/nickname?query=${encodeURIComponent(nickname)}`,
    );
    if (
      !isObject(lookup.user) ||
      typeof lookup.user.uid !== "string" ||
      !lookup.user.uid
    )
      throw new AppError(
        "플레이어를 찾지 못했습니다. 현재 닉네임을 확인해 주세요.",
        404,
      );
    const uid = lookup.user.uid;
    const response = await request(
      `/v1/user/games/uid/${encodeURIComponent(uid)}`,
    );
    if (!Array.isArray(response.userGames))
      throw new AppError("경기 목록 응답 형식을 확인할 수 없습니다.", 502);
    const names = await characterNames();
    const unique = new Map<string, Match>();
    for (const raw of response.userGames) {
      if (!isObject(raw)) continue;
      const match = normalizeMatch(raw, names);
      if (match) unique.set(match.id, match);
    }
    const matches = [...unique.values()]
      .sort((a, b) => {
        if (a.startedAt && b.startedAt)
          return Date.parse(b.startedAt) - Date.parse(a.startedAt);
        return Number(b.id) - Number(a.id);
      })
      .slice(0, 100);
    const value: PlayerData = {
      source: "live",
      nickname:
        typeof lookup.user.nickname === "string"
          ? lookup.user.nickname
          : nickname,
      uid,
      fetchedAt: new Date().toISOString(),
      matches,
      notice: "최근 90일 · 현재 닉네임 사용 기간 내 제공된 경기만 표시됩니다.",
    };
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(nickname, { until: Date.now() + 60_000, value });
    return value;
  }
  return { getPlayer };
}
