import { AppError } from "./errors.ts";
import type { HistoryPage, Match, PlayerData, RankedProfile, Season } from "../types";
import { isBeforeSeason, mergeMatches } from "../season-history.ts";
import catalog from "../generated/game-assets.json" with { type: "json" };
import { memoryStore } from "./state-store.ts";
import type { StateStore } from "./state-store.ts";
import { createRequestGate } from "./request-gate.ts";

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
    characterName: names[code] || (catalog.characters as Record<string, { name: string }>)[code]?.name || `실험체 ${code}`,
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
    details: {
      level: number(raw.characterLevel),
      teamKills: number(raw.teamKill),
      credits: number(raw.totalGainVFCredit),
      vision: number(raw.viewContribution),
      animalDamage: number(raw.damageToMonster),
      escapeState: number(raw.escapeState),
      rpBefore: number(raw.mmrBefore),
      rpAfter: number(raw.mmrAfter),
      equipment: isObject(raw.equipment)
        ? Object.entries(raw.equipment).filter(([slot, code]) => /^[0-4]$/.test(slot) && Number.isSafeInteger(code) && Number(code) > 0)
          .map(([slot, code]) => ({ slot: Number(slot), code: Number(code) })).sort((a, b) => a.slot - b.slot)
        : [],
      mainTrait: number(raw.traitFirstCore, 1),
      subTraits: [raw.traitFirstSub, raw.traitSecondSub].flatMap((list) => Array.isArray(list) ? list.filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0) : []).slice(0, 5),
      tacticalSkill: number(raw.tacticalSkillGroup, 1),
      tacticalLevel: number(raw.tacticalSkillLevel),
    },
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

export function currentSeason(data: unknown): { id: number; name: string } | null {
  if (!Array.isArray(data)) return null;
  const candidates = data.filter((row) => isObject(row) && (row.isCurrent === 1 || row.isCurrent === true) && Number.isSafeInteger(row.seasonID) && Number(row.seasonID) > 0);
  if (candidates.length !== 1) return null;
  const id = candidates[0].seasonID as number;
  const name = (catalog.seasons as Record<string, string>)[id] || `현재 시즌 (ID ${id})`;
  return { id, name };
}

export function normalizeSeasons(data: unknown): Season[] {
  if (!Array.isArray(data)) return [];
  const date = (value: unknown) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}[ T]/.test(value)) return null;
    const day = value.slice(0, 10);
    const time = Date.parse(`${day}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().startsWith(day) ? day : null;
  };
  const current = currentSeason(data);
  const seasons = new Map<number, Season>();
  for (const raw of data) {
    if (!isObject(raw) || !Number.isSafeInteger(raw.seasonID) || Number(raw.seasonID) <= 0) continue;
    const id = Number(raw.seasonID);
    seasons.set(id, {
      id, name: (catalog.seasons as Record<string, string>)[id] || `시즌 ID ${id}`,
      isCurrent: id === current?.id,
      // Season tables supply calendar dates with no timezone. Do not parse their times as UTC.
      startDate: date(raw.seasonStart), endDate: date(raw.seasonEnd),
    });
  }
  return [...seasons.values()].sort((a, b) => b.id - a.id);
}

export function normalizeRankedProfile(season: { id: number; name: string }, rankData: Raw, statsData: Raw): RankedProfile {
  const rank = isObject(rankData.userRank) ? rankData.userRank : {};
  const stats = Array.isArray(statsData.userStats) ? statsData.userStats.find((s) => isObject(s) && s.seasonId === season.id && s.matchingMode === 3 && s.matchingTeamMode === 3) ?? {} : {};
  const totalGames = number(stats.totalGames);
  const teamKills = number(stats.totalTeamKills);
  const percent = number(stats.rankPercent);
  return {
    seasonId: season.id, seasonName: season.name,
    rp: number(rank.mmr) ?? number(stats.mmr),
    rank: number(rank.rank, 1) ?? number(stats.rank, 1),
    serverRank: number(rank.serverRank, 1), serverCode: number(rank.serverCode),
    rankPercent: percent !== null && percent <= 1 ? percent * 100 : null,
    totalGames, totalWins: number(stats.totalWins), averageRank: number(stats.averageRank, 1),
    averageTeamKills: totalGames && teamKills !== null ? teamKills / totalGames : null,
  };
}

export function createErClient(apiKey: string, fetcher: typeof fetch = fetch, options: {
  store?: StateStore; maxHistories?: number; refreshCooldown?: boolean;
  gate?: ReturnType<typeof createRequestGate>;
} = {}) {
  const store = options.store ?? memoryStore();
  type HistoryEntry = {
    player: PlayerData; names: Record<number, string>; until: number;
    last?: { cursor: string; page: number };
  };
  type Cached<T> = { until: number; value: T };
  const pendingPages = new Map<string, Promise<HistoryPage>>();
  const pendingPlayers = new Map<string, Promise<PlayerData>>();
  const gate = options.gate ?? createRequestGate(store);
  const historyKey = (id: string) => `history:${id}`;
  const pageKey = (id: string, page: number) => `page:${id}:${page}`;
  function removeHistory(id: string) {
    store.delete(historyKey(id));
    for (const key of store.keys(`page:${id}:`)) store.delete(key);
  }
  function prune() {
    for (const key of [...store.keys("history:"), ...store.keys("cache:"), ...store.keys("meta:")]) {
      const entry = store.get<{ until: number }>(key);
      if (entry && entry.until <= Date.now()) {
        if (key.startsWith("history:")) removeHistory(key.slice(8));
        else store.delete(key);
      }
    }
  }
  async function request(path: string): Promise<Raw> {
    if (!apiKey.trim())
      throw new AppError(
        "실제 전적 검색을 사용하려면 서버의 ER_API_KEY 설정이 필요합니다. 현재는 예시 모드를 이용할 수 있어요.",
        503,
      );
    // Personal keys allow one request per second. Leave a small timing margin.
    // https://developer.eternalreturn.io/getting-started
    try {
      const response = await gate(() => fetcher(`https://open-api.bser.io${path}`, {
        headers: { "x-api-key": apiKey.trim(), Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      }));
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
    }
  }
  async function characterNames(): Promise<Record<number, string>> {
    const nameCache = store.get<Cached<Record<number, string>>>("meta:names");
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
        redirect: "manual",
      });
      if (!response.ok) return {};
      const text = await response.text();
      if (text.length > 12_000_000) return {};
      const names = parseLocalization(text);
      store.set("meta:names", { until: Date.now() + 86_400_000, value: names });
      return names;
    } catch {
      return {};
    }
  }
  async function getPlayer(
    nickname: string,
    refresh = false,
    seasonId?: number,
  ): Promise<PlayerData> {
    const key = JSON.stringify([nickname, seasonId ?? "current"]);
    const active = pendingPlayers.get(key);
    if (active) return active;
    const job = loadPlayer(nickname, refresh, seasonId);
    pendingPlayers.set(key, job);
    try { return await job; } finally { pendingPlayers.delete(key); }
  }
  async function loadPlayer(nickname: string, refresh: boolean, seasonId?: number): Promise<PlayerData> {
    const cacheKey = `cache:${JSON.stringify([nickname, seasonId ?? "current"])}`;
    const cached = store.get<Cached<string>>(cacheKey);
    if ((!refresh || options.refreshCooldown) && cached && cached.until > Date.now()) {
      const entry = store.get<HistoryEntry>(historyKey(cached.value));
      if (entry && entry.until > Date.now()) return getHistoryPlayer(cached.value, entry.player.nickname, seasonId);
    }
    const lookup = await request(
      `/v1/user/nickname?query=${encodeURIComponent(nickname)}`,
    );
    if (!isObject(lookup.user))
      throw new AppError(
        "플레이어를 찾지 못했습니다. 현재 닉네임을 확인해 주세요.",
        404,
      );
    // Live responses use userId; the official response example still calls it uid.
    // Both are opaque strings used by the same /uid/ endpoints (never userNum).
    const uid = [lookup.user.userId, lookup.user.uid].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    if (!uid)
      throw new AppError(
        "플레이어 조회 응답의 식별자를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        502,
      );
    const response = await request(
      `/v1/user/games/uid/${encodeURIComponent(uid)}`,
    );
    if (!Array.isArray(response.userGames))
      throw new AppError("경기 목록 응답 형식을 확인할 수 없습니다.", 502);
    const names = await characterNames();
    const records: Match[] = [];
    for (const raw of response.userGames) {
      if (!isObject(raw)) continue;
      const match = normalizeMatch(raw, names);
      if (match) records.push(match);
    }
    let seasons: Season[] = [];
    let season: Season | null = null;
    let ranked: RankedProfile | null = null;
    let rankedNotice = "";
    try {
      let seasonCache = store.get<Cached<Season[]>>("meta:seasons");
      if (!seasonCache || seasonCache.until <= Date.now()) {
        const data = await request("/v2/data/Season");
        const list = normalizeSeasons(data.data);
        seasonCache = { until: Date.now() + (list.length ? 3_600_000 : 60_000), value: list };
        store.set("meta:seasons", seasonCache);
      }
      seasons = seasonCache.value;
      season = (seasonId === undefined ? seasons.find((s) => s.isCurrent) : seasons.find((s) => s.id === seasonId)) ?? null;
      if (season) {
        const results = await Promise.allSettled([
          request(`/v1/rank/uid/${encodeURIComponent(uid)}/${season.id}/3`),
          request(`/v2/user/stats/uid/${encodeURIComponent(uid)}/${season.id}/3`),
        ]);
        ranked = normalizeRankedProfile(season,
          results[0].status === "fulfilled" ? results[0].value : {},
          results[1].status === "fulfilled" ? results[1].value : {});
        if (results.some((r) => r.status === "rejected")) rankedNotice = "시즌 성적 일부를 불러오지 못했습니다. 전적 새로고침으로 다시 확인할 수 있어요.";
      } else rankedNotice = "현재 시즌 정보를 확인할 수 없어 티어·시즌 성적을 표시하지 않았습니다.";
    } catch {
      rankedNotice = "시즌 성적을 불러오지 못했습니다. 최근 경기는 아래에서 확인할 수 있어요.";
    }
    if (seasonId !== undefined && !season)
      throw new AppError("선택한 시즌 정보를 확인할 수 없습니다. 전적을 새로고침해 주세요.", 422);
    const matches = mergeMatches([], records.filter((match) => !season || match.seasonId === season.id));
    const next = isBeforeSeason(records, season, seasons) ? null : nextCursor(response.next);
    const value: PlayerData = {
      source: "live",
      nickname:
        typeof lookup.user.nickname === "string"
          ? lookup.user.nickname
          : nickname,
      uid,
      fetchedAt: new Date().toISOString(),
      matches,
      ranked,
      rankedNotice,
      seasons, season,
      history: { id: crypto.randomUUID(), next, pages: 1, exhausted: next === null },
      notice: "최근 90일 · 현재 닉네임 사용 기간 내 제공된 경기만 표시됩니다.",
    };
    store.transaction(() => {
      prune();
      const caches = store.keys("cache:");
      if (caches.length >= (options.maxHistories ?? 100)) store.delete(caches[0]);
      const histories = store.keys("history:");
      if (histories.length >= (options.maxHistories ?? 20)) {
        // Never evict a session while its next page is being fetched.
        const oldest = histories.find((key) => !pendingPages.has(key.slice(8)));
        if (!oldest) throw new AppError("전적 조회가 많습니다. 잠시 후 다시 검색해 주세요.", 429);
        removeHistory(oldest.slice(8));
      }
      store.set(cacheKey, { until: Date.now() + 60_000, value: value.history!.id });
      store.set(historyKey(value.history!.id), { player: { ...value, matches: [] }, names, until: Date.now() + 1_800_000 });
      store.set(pageKey(value.history!.id, 1), { matches, history: value.history! });
    });
    return value;
  }
  function nextCursor(value: unknown): string | null {
    if (value === undefined || value === null || value === 0 || value === "0") return null;
    if ((typeof value === "number" && Number.isSafeInteger(value) && value > 0) ||
      (typeof value === "string" && /^[1-9]\d{0,19}$/.test(value))) return String(value);
    throw new AppError("다음 경기 위치를 확인할 수 없습니다. 전적을 새로고침해 주세요.", 502);
  }
  function historyEntry(id: string): HistoryEntry {
    const entry = store.get<HistoryEntry>(historyKey(id));
    if (!entry || entry.until <= Date.now()) {
      removeHistory(id);
      throw new AppError("전적 조회가 만료되었습니다. 전적을 새로고침해 주세요.", 409);
    }
    entry.until = Date.now() + 1_800_000;
    store.set(historyKey(id), entry);
    return entry;
  }
  function getHistoryPlayer(id: string, nickname: string, seasonId?: number, pages?: number): PlayerData {
    const entry = historyEntry(id);
    const { player } = entry;
    if (player.nickname !== nickname || (seasonId !== undefined && player.season?.id !== seasonId))
      throw new AppError("조회한 플레이어와 시즌을 다시 확인해 주세요.", 409);
    const count = pages ?? player.history!.pages;
    if (!Number.isInteger(count) || count < 1 || count > player.history!.pages)
        throw new AppError("화면의 전적 범위를 확인할 수 없습니다. 전적을 새로고침해 주세요.", 409);
    const batches: HistoryPage[] = [];
    for (let page = 1; page <= count; page++) {
      const batch = store.get<HistoryPage>(pageKey(id, page));
      if (!batch) throw new AppError("저장된 전적을 확인할 수 없습니다. 전적을 새로고침해 주세요.", 409);
      batches.push(batch);
    }
    // A paused browser may not receive an in-flight page. Review only acknowledged pages.
    return { ...player, matches: mergeMatches([], batches.flatMap((batch) => batch.matches)), history: batches[count - 1].history };
  }
  async function continueHistory(id: string, cursor: string): Promise<HistoryPage> {
    const entry = historyEntry(id);
    if (entry.last?.cursor === cursor) {
      const previous = store.get<HistoryPage>(pageKey(id, entry.last.page));
      if (previous) return previous;
    }
    if (entry.player.history?.next !== cursor)
      throw new AppError("경기 조회 위치가 변경되었습니다. 전적을 새로고침해 주세요.", 409);
    const pending = pendingPages.get(id);
    if (pending) return pending;
    const job = (async () => {
      const player = entry.player;
      const response = await request(`/v1/user/games/uid/${encodeURIComponent(player.uid)}?next=${encodeURIComponent(cursor)}`);
      if (!Array.isArray(response.userGames)) throw new AppError("경기 목록 응답 형식을 확인할 수 없습니다.", 502);
      const records = response.userGames.flatMap((raw) => {
        const match = isObject(raw) ? normalizeMatch(raw, entry.names) : null;
        return match ? [match] : [];
      });
      const next = isBeforeSeason(records, player.season ?? null, player.seasons ?? []) ? null : nextCursor(response.next);
      if (next !== null && BigInt(next) >= BigInt(cursor))
        throw new AppError("전적 서버가 같은 경기 목록을 반복해서 반환했습니다. 잠시 후 이어서 불러와 주세요.", 502);
      const matches = mergeMatches([], records.filter((match) => !player.season || match.seasonId === player.season.id));
      const page: HistoryPage = { matches, history: { id, next, pages: player.history!.pages + 1, exhausted: next === null } };
      entry.player = { ...player, matches: [], history: page.history };
      entry.last = { cursor, page: page.history.pages };
      entry.until = Date.now() + 1_800_000;
      store.transaction(() => {
        store.set(pageKey(id, page.history.pages), page);
        store.set(historyKey(id), entry);
      });
      return page;
    })();
    pendingPages.set(id, job);
    try { return await job; } finally { pendingPages.delete(id); }
  }
  return { getPlayer, continueHistory, getHistoryPlayer, prune };
}
