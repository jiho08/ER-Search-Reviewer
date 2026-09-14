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
  return {
    source: "demo",
    nickname: DEMO_NICKNAME,
    uid: "demo-lumia",
    fetchedAt: "2026-09-14T03:00:00.000Z",
    notice:
      "기능을 체험하기 위한 가상 전적입니다. 실제 플레이어의 기록이 아닙니다.",
    matches: ranks.map((rank, i) => {
      const character = roster[i % 5 < 3 ? 0 : i % 5 === 3 ? 1 : 2];
      return {
        id: `demo-${10020 - i}`,
        characterCode: character.code,
        characterName: character.name,
        mode: i % 6 === 5 ? 2 : 3,
        teamMode: 3,
        seasonId: null,
        startedAt: new Date(
          Date.UTC(2026, 8, 14, 2, 30) - i * 3_900_000,
        ).toISOString(),
        rank,
        kills: Math.max(1, 9 - rank + (i % 3)),
        deaths: rank === 1 ? 0 : 1 + (i % 3),
        assists: 3 + ((i * 7) % 11),
        damage: 8200 + (9 - rank) * 1200 + i * 317,
        damageTaken: 6400 + i * 623,
        hunting: 30 + (i % 19),
        duration: 1480 - rank * 79 + (i % 4) * 32,
        mmrGain: null,
      };
    }),
  };
}
