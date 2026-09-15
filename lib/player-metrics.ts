import { mean, summarize } from "./analysis.ts";
import type { Match } from "./types";

export function detailedStats(matches: Match[]) {
  const knownRanks = matches.filter((m) => m.rank !== null);
  const gains = matches.filter((m) => m.mode === 3 && m.mmrGain !== null);
  return {
    ...summarize(matches),
    averageTeamKills: mean(matches.map((m) => m.details?.teamKills ?? null)),
    averageHunts: mean(matches.map((m) => m.hunting)),
    averageCredits: mean(matches.map((m) => m.details?.credits ?? null)),
    averageVision: mean(matches.map((m) => m.details?.vision ?? null)),
    averageAnimalDamage: mean(matches.map((m) => m.details?.animalDamage ?? null)),
    top2: knownRanks.length ? 100 * knownRanks.filter((m) => m.rank! <= 2).length / knownRanks.length : null,
    top3: knownRanks.length ? 100 * knownRanks.filter((m) => m.rank! <= 3).length / knownRanks.length : null,
    rpGain: gains.length ? gains.reduce((sum, m) => sum + m.mmrGain!, 0) : null,
    rpSamples: gains.length,
  };
}

const DAY = 86_400_000;
function koreanDate(value: string | null): string | null {
  if (!value || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time + 9 * 3_600_000).toISOString().slice(0, 10) : null;
}

export interface DailyRPPoint {
  date: string;
  games: number;
  gainGames: number;
  rp: number | null;
  gain: number | null;
}

// Group by Korean match-start date. Missing days/scores are never backfilled.
export function dailyRPHistory(matches: Match[], options: {
  seasonId?: number | null; days?: number | "season"; asOf: string;
  startDate?: string | null; endDate?: string | null;
}): DailyRPPoint[] {
  const { seasonId = null, days = 30, asOf } = options;
  const today = koreanDate(asOf);
  if (!today || (days !== "season" && (!Number.isInteger(days) || days < 1 || days > 90))) return [];
  const ranked = matches.filter((m) => m.mode === 3 && m.teamMode === 3);
  const season = seasonId ?? ranked.find((m) => m.seasonId !== null)?.seasonId ?? null;
  if (season === null) return [];
  const validDate = (value: string | null | undefined) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
  const endDate = validDate(options.endDate) && options.endDate! < today ? options.endDate! : today;
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const observedStart = ranked.filter((m) => m.seasonId === season).map((m) => koreanDate(m.startedAt)).filter((date): date is string => date !== null && date <= endDate).sort()[0];
  const start = days === "season"
    ? Date.parse(`${validDate(options.startDate) ? options.startDate : observedStart ?? endDate}T00:00:00Z`)
    : end - (days - 1) * DAY;
  const length = Math.round((end - start) / DAY) + 1;
  if (length < 1 || length > 366) return [];
  const points = Array.from({ length }, (_, index): DailyRPPoint => ({
    date: new Date(start + index * DAY).toISOString().slice(0, 10),
    games: 0, gainGames: 0, rp: null, gain: null,
  }));
  const byDate = new Map(points.map((point) => [point.date, point]));
  const dated = ranked.filter((match) => match.seasonId === season && koreanDate(match.startedAt) !== null)
    .sort((a, b) => Date.parse(a.startedAt!) - Date.parse(b.startedAt!));
  for (const match of dated) {
    const point = byDate.get(koreanDate(match.startedAt)!);
    if (!point) continue;
    point.games++;
    // A missing score in the day's latest game must not become an older game's score.
    point.rp = match.details?.rpAfter ?? null;
    if (match.mmrGain !== null) {
      point.gain = (point.gain ?? 0) + match.mmrGain;
      point.gainGames++;
    }
  }
  return points;
}

export function matchOutcome(match: Match) {
  if (match.rank === 1) return "victory";
  if (match.details?.escapeState === 3) return "escape-success";
  if (match.details?.escapeState === 1 || match.details?.escapeState === 2) return "escape-failure";
  return match.rank === 2 || match.rank === 3 ? "podium" : "normal";
}

export const signedNumber = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${value.toLocaleString("ko-KR")}`;
