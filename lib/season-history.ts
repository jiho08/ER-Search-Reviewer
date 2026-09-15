import type { Match, Season } from "./types";

export function mergeMatches(existing: Match[], incoming: Match[]): Match[] {
  const unique = new Map(existing.map((match) => [match.id, match]));
  for (const match of incoming) unique.set(match.id, match);
  return [...unique.values()].sort((a, b) => {
    if (a.startedAt && b.startedAt) {
      const delta = Date.parse(b.startedAt) - Date.parse(a.startedAt);
      if (delta) return delta;
    }
    // Game IDs can exceed JS's safe integer range; keep their original strings.
    return b.id.length - a.id.length || b.id.localeCompare(a.id);
  });
}

export function isBeforeSeason(matches: Match[], season: Season | null, seasons: Season[]): boolean {
  if (!season?.startDate || !matches.length) return false;
  return matches.every((match) => {
    const previous = seasons.find((entry) => entry.id === match.seasonId);
    return previous?.startDate && previous.startDate < season.startDate!;
  });
}
