import type { PlayerData } from "./types";
// Fictional fixtures, never returned as a real player's records.
export const DEMO_NICKNAME = "루미아연구원";
export function createDemoData(): PlayerData {
  const ranks = [1, 3, 2, 6, 1, 4, 2, 7, 3, 1, 5, 2, 6, 4, 1, 3, 8, 2, 5, 4];
  const roster = [
    { code: 2, name: "아야" },
    { code: 1, name: "재키" },
    { code: 6, name: "나딘" },
  ];
  let rp = 6600;
  const gainByRank = [0, 118, 65, 22, -15, -27, -44, -63, -78];
  const scores = new Map<number, { before: number; after: number; gain: number }>();
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (i % 6 === 5) continue;
    const gain = gainByRank[ranks[i]] + (i % 3) * 3;
    scores.set(i, { before: rp, after: rp + gain, gain });
    rp += gain;
  }
  return {
    source: "demo",
    nickname: DEMO_NICKNAME,
    uid: "demo-lumia",
    fetchedAt: "2026-09-14T03:00:00.000Z",
    notice:
      "기능을 체험하기 위한 가상 전적입니다. 실제 플레이어의 기록이 아닙니다.",
    season: { id: 41, name: "시즌 12 · 예시", isCurrent: true, startDate: "2026-08-13", endDate: "2026-11-12" },
    seasons: [{ id: 41, name: "시즌 12 · 예시", isCurrent: true, startDate: "2026-08-13", endDate: "2026-11-12" }],
    ranked: { seasonId: 41, seasonName: "시즌 12 · 예시", rp, rank: 7328, serverRank: 7186, serverCode: 10, rankPercent: 4.12, totalGames: 86, totalWins: 14, averageRank: 3.8, averageTeamKills: 10.42 },
    matches: ranks.map((rank, i) => {
      const character = roster[i % 5 < 3 ? 0 : i % 5 === 3 ? 1 : 2];
      return {
        id: `demo-${10020 - i}`,
        characterCode: character.code,
        characterName: character.name,
        mode: i % 6 === 5 ? 2 : 3,
        teamMode: 3,
        seasonId: 41,
        startedAt: new Date(
          Date.UTC(2026, 8, 14, 2, 30) - Math.floor(i / 3) * 86_400_000 - (i % 3) * 3_900_000,
        ).toISOString(),
        rank,
        kills: Math.max(1, 9 - rank + (i % 3)),
        deaths: rank === 1 ? 0 : 1 + (i % 3),
        assists: 3 + ((i * 7) % 11),
        damage: 8200 + (9 - rank) * 1200 + i * 317,
        damageTaken: 6400 + i * 623,
        hunting: 30 + (i % 19),
        duration: 1480 - rank * 79 + (i % 4) * 32,
        mmrGain: scores.get(i)?.gain ?? null,
        details: {
          level: Math.max(12, 21 - Math.floor(rank / 2)),
          teamKills: Math.max(3, 20 - rank * 2 + (i % 4)),
          credits: 690 + (9 - rank) * 51 + (i % 4) * 37,
          vision: 12 + ((i * 7) % 32),
          animalDamage: 25000 + ((i * 5713) % 40000),
          escapeState: i === 3 ? 3 : i === 7 ? 2 : i === 12 ? 1 : 0,
          rpBefore: scores.get(i)?.before ?? null,
          rpAfter: scores.get(i)?.after ?? null,
          equipment: [character.code === 2 ? 117406 : character.code === 1 ? 105407 : 114502,
            character.code === 1 ? 202524 : 202503, i % 2 ? 201423 : 201505,
            i % 2 ? 203408 : 203502, rank <= 3 ? 204502 : 204402].map((code, slot) => ({ code, slot })),
          mainTrait: character.code === 1 ? 7000401 : 7000601,
          subTraits: [7010701, 7110101, 7110701],
          tacticalSkill: 30,
          tacticalLevel: rank <= 3 ? 2 : 1,
        },
      };
    }),
  };
}
