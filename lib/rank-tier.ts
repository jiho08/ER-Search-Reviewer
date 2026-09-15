// Official tier thresholds, verified 2026-09-14. See docs/research/player-dashboard.md.
const tiers = [
  { id: 1, name: "아이언", start: 0, step: 150 },
  { id: 2, name: "브론즈", start: 600, step: 200 },
  { id: 3, name: "실버", start: 1400, step: 250 },
  { id: 4, name: "골드", start: 2400, step: 300 },
  { id: 5, name: "플래티넘", start: 3600, step: 350 },
  { id: 6, name: "다이아몬드", start: 5000, step: 350 },
  { id: 63, name: "메테오라이트", start: 6400, step: 300 },
];
export function rankTier(rp: number | null) {
  if (rp === null || !Number.isFinite(rp) || rp < 0) return null;
  // High tiers also depend on server eligibility and promotion rules unavailable in userRank.
  if (rp >= 7600) return { id: 66, name: "미스릴 이상", division: null, progress: null, next: null, within: rp - 7600 };
  const tier = [...tiers].reverse().find((entry) => rp >= entry.start)!;
  const completed = Math.floor((rp - tier.start) / tier.step);
  const within = rp - tier.start - completed * tier.step;
  return { id: tier.id, name: tier.name, division: 4 - completed, progress: within / tier.step * 100, next: tier.step - within, within };
}
