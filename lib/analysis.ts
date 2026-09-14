import type { Match, MatchMode, Summary } from "./types";

export function mean(values: (number | null)[]): number | null {
  const usable = values.filter(
    (n): n is number => n !== null && Number.isFinite(n),
  );
  return usable.length
    ? usable.reduce((sum, n) => sum + n, 0) / usable.length
    : null;
}
export function filterMatches(
  matches: Match[],
  mode: MatchMode = "all",
  character = "all",
): Match[] {
  return matches.filter(
    (match) =>
      (mode === "all" || match.mode === (mode === "ranked" ? 3 : 2)) &&
      (character === "all" || String(match.characterCode) === character),
  );
}
export function summarize(matches: Match[]): Summary {
  const ranked = matches.filter((m) => m.rank !== null);
  const wins = ranked.filter((m) => m.rank === 1).length;
  const half = Math.floor(matches.length / 2);
  const recentRanks = matches
    .slice(0, half)
    .map((m) => m.rank)
    .filter((n) => n !== null);
  const olderRanks = matches
    .slice(half, half * 2)
    .map((m) => m.rank)
    .filter((n) => n !== null);
  const recent = mean(recentRanks),
    older = mean(olderRanks);
  return {
    count: matches.length,
    wins,
    winRate: ranked.length ? (wins / ranked.length) * 100 : null,
    averageRank: mean(matches.map((m) => m.rank)),
    averageKills: mean(matches.map((m) => m.kills)),
    averageDamage: mean(matches.map((m) => m.damage)),
    averageDuration: mean(matches.map((m) => m.duration)),
    averageAssists: mean(matches.map((m) => m.assists)),
    averageDeaths: mean(matches.map((m) => m.deaths)),
    rankChange:
      recentRanks.length >= 3 &&
      olderRanks.length >= 3 &&
      recent !== null &&
      older !== null
        ? older - recent
        : null,
  };
}
export function characterStats(matches: Match[]) {
  const groups = new Map<number, Match[]>();
  for (const match of matches)
    groups.set(match.characterCode, [
      ...(groups.get(match.characterCode) ?? []),
      match,
    ]);
  return [...groups.entries()]
    .map(([code, games]) => ({
      code,
      name: games[0].characterName,
      ...summarize(games),
    }))
    .sort((a, b) => b.count - a.count);
}
export const formatNumber = (n: number | null, digits = 0): string =>
  n === null
    ? "—"
    : n.toLocaleString("ko-KR", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  return `${Math.floor(seconds / 60)}분 ${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}초`;
}
export const modeLabel = (mode: number) =>
  mode === 3 ? "랭크" : mode === 2 ? "일반" : `모드 ${mode}`;
