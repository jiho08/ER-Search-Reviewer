import {
  characterStats,
  formatDuration,
  formatNumber,
  mean,
  summarize,
} from "../analysis.ts";
import type { Match, ReviewFocus, ReviewResult, ToolTrace } from "../types";

export const TOOL_REGISTRY = {
  get_recent_matches: {
    label: "전적 조회",
    description: "분석 범위의 최근 경기 수와 경기별 기록을 확인합니다.",
    execute: (matches: Match[]) => ({
      count: matches.length,
      records: matches
        .slice(0, 20)
        .map(
          ({
            id,
            characterName,
            rank,
            kills,
            assists,
            deaths,
            damage,
            duration,
            mode,
          }) => ({
            id,
            characterName,
            rank,
            kills,
            assists,
            deaths,
            damage,
            duration,
            mode,
          }),
        ),
      note: "records는 최근 최대 20개, 나머지 도구는 선택된 전체 경기를 계산",
    }),
  },
  analyze_combat: {
    label: "교전 지표 분석",
    description:
      "평균 처치·사망·어시스트·피해량 및 분당 피해량을 계산합니다. 포지셔닝은 확인할 수 없습니다.",
    execute: (matches: Match[]) => ({
      summary: summarize(matches),
      damagePerMinute: mean(
        matches.map((m) =>
          m.damage !== null && m.duration !== null && m.duration > 0
            ? (m.damage / m.duration) * 60
            : null,
        ),
      ),
      damageSampleCount: matches.filter((m) => m.damage !== null).length,
    }),
  },
  analyze_survival: {
    label: "생존 지표 분석",
    description:
      "승률·평균 순위·플레이 시간과 최근/이전 구간 순위 변화를 확인합니다. 생존 시간으로 탈락 원인을 단정하지 않습니다.",
    execute: (matches: Match[]) => ({
      summary: summarize(matches),
      rankSampleCount: matches.filter((m) => m.rank !== null).length,
      recentWindow: Math.floor(matches.length / 2),
      note: "rankChange 양수는 평균 순위 개선. 각 구간 최소 3경기가 아니면 null.",
    }),
  },
  analyze_characters: {
    label: "실험체별 분석",
    description:
      "실험체별 경기 수·평균 순위·승률을 비교합니다. 작은 표본으로 실력·메타 우열을 확정하지 않습니다.",
    execute: (matches: Match[]) => ({
      characters: characterStats(matches),
      note: "게임 모드·시즌·매치 상대 차이는 통제되지 않음",
    }),
  },
} as const;
export type ToolName = keyof typeof TOOL_REGISTRY;
export function selectTools(focus: ReviewFocus): ToolName[] {
  const selected: ToolName[] = ["get_recent_matches"];
  if (focus === "overall" || focus === "combat")
    selected.push("analyze_combat");
  if (focus === "overall" || focus === "survival")
    selected.push("analyze_survival");
  if (focus === "overall" || focus === "character")
    selected.push("analyze_characters");
  return selected;
}
export function executeTool(
  name: ToolName,
  matches: Match[],
  trace: ToolTrace[],
) {
  const tool = TOOL_REGISTRY[name];
  const result = tool.execute(matches);
  trace.push({
    name,
    label: tool.label,
    result: `${matches.length}경기 기준 · 계산 완료`,
  });
  return result;
}
export function reviewLimitations(matches: Match[]): string[] {
  return [
    "조회된 경기만 분석했습니다. 전체 시즌 또는 동티어 평균과의 비교가 아닙니다.",
    "동선·시야·교전 장면을 볼 수 없어 포지셔닝이나 패배 원인을 확정할 수 없습니다.",
    ...(matches.length < 10
      ? [
          `현재 표본은 ${matches.length}경기입니다. 경기를 더 모아 경향을 확인하세요.`,
        ]
      : []),
    ...(new Set(matches.map((m) => m.mode)).size > 1
      ? [
          "서로 다른 게임 모드가 포함되어 있습니다. 모드를 좁히면 비교하기 쉬워집니다.",
        ]
      : []),
    ...(new Set(matches.map((m) => m.seasonId).filter((id) => id !== null))
      .size > 1
      ? [
          "여러 시즌의 경기가 포함되어 있어 패치·시즌 차이가 결과에 영향을 줄 수 있습니다.",
        ]
      : []),
  ];
}
export function basicReview(
  matches: Match[],
  focus: ReviewFocus,
): Pick<ReviewResult, "title" | "summary" | "observations" | "trace"> {
  const trace: ToolTrace[] = [];
  const results = new Map<ToolName, ReturnType<typeof executeTool>>();
  for (const name of selectTools(focus))
    results.set(name, executeTool(name, matches, trace));
  const stats = summarize(matches);
  const observations: ReviewResult["observations"] = [];
  if (results.has("analyze_combat"))
    observations.push({
      title: "교전 기여도를 기록으로 확인해요",
      evidence: `평균 처치 ${formatNumber(stats.averageKills, 1)}, 어시스트 ${formatNumber(stats.averageAssists, 1)}, 사망 ${formatNumber(stats.averageDeaths, 1)}회입니다. 플레이어에게 가한 평균 피해량은 ${formatNumber(stats.averageDamage)}입니다. 미제공 수치는 —로 표시합니다.`,
      action:
        "다음 경기에서는 첫 교전 직전 팀원과의 거리와 교전 후 생존 여부를 직접 기록해 보세요. 피해량과 함께 돌아볼 기준이 됩니다.",
    });
  if (results.has("analyze_survival"))
    observations.push({
      title:
        stats.rankChange !== null && stats.rankChange > 0
          ? "최근 구간의 평균 순위가 좋아졌어요"
          : "최종 순위와 플레이 시간을 함께 돌아봐요",
      evidence: `평균 ${formatNumber(stats.averageRank, 1)}위, ${stats.wins}승이며 평균 플레이 시간은 ${formatDuration(stats.averageDuration)}입니다.${stats.rankChange !== null ? ` 최근 ${Math.floor(matches.length / 2)}경기와 이전 같은 수의 경기 비교에서 평균 순위가 ${Math.abs(stats.rankChange).toFixed(1)}위 ${stats.rankChange > 0 ? "상승" : stats.rankChange < 0 ? "하락" : "변화 없음"}으로 나타났습니다.` : " 구간 비교에는 각각 최소 3경기가 필요합니다."}`,
      action:
        "최종 순위가 좋았던 경기와 아쉬웠던 경기를 하나씩 골라, 마지막 교전을 시작한 이유와 당시 준비 상태를 비교해 보세요.",
    });
  if (results.has("analyze_characters")) {
    const most = characterStats(matches)[0];
    if (most)
      observations.push({
        title: `${most.name}의 기록부터 차근히 돌아봐요`,
        evidence: `가장 많이 사용한 실험체는 ${most.name}입니다. ${most.count}경기, 평균 ${formatNumber(most.averageRank, 1)}위, 승률 ${formatNumber(most.winRate, 1)}%입니다. 경기 수와 조건이 달라 실험체 사이의 성능 우열로 해석하지 않습니다.`,
        action:
          "이 실험체와 같은 모드로 범위를 좁혀 여러 경기를 더 모아 보세요. 조작에 익숙한 실험체로 한 가지 개선 목표를 반복해서 연습하기 좋습니다.",
      });
  }
  const labels: Record<ReviewFocus, string> = {
    overall: "최근 기록으로 돌아보는 나의 플레이",
    combat: "교전 기록에서 찾는 다음 목표",
    survival: "생존과 순위로 돌아보는 플레이",
    character: "자주 쓰는 실험체의 플레이 기록",
  };
  return {
    title: labels[focus],
    summary: `선택한 ${matches.length}경기를 분석했습니다. 평균 순위는 ${formatNumber(stats.averageRank, 1)}위, 승률은 ${formatNumber(stats.winRate, 1)}%입니다. 아래 수치와 직접 기억하는 경기 장면을 함께 살펴보세요.`,
    observations,
    trace,
  };
}
