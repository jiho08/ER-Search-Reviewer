"use client";
import { useState } from "react";
import { TrendingUp, Trophy } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Line, Bar, Cell, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { formatNumber } from "@/lib/analysis";
import { detailedStats, dailyRPHistory, signedNumber } from "@/lib/player-metrics";
import { rankTier } from "@/lib/rank-tier";
import { GameImage } from "@/components/game-image";
import type { Match, PlayerData } from "@/lib/types";

export function RankedCard({ player }: { player: PlayerData }) {
  const rank = player.ranked;
  const historical = player.season?.isCurrent === false;
  const tier = historical || rank?.totalGames === 0 ? null : rankTier(rank?.rp ?? null);
  return <section className="ranked-card" aria-label="선택한 시즌 랭크">
    <div className="section-heading"><h3>{historical ? "시즌 랭크" : "현재 랭크"}</h3><span>{rank?.seasonName ?? "시즌 확인 대기"} · 스쿼드</span></div>
    <div className="tier-identity">
      <GameImage kind="tiers" code={tier?.id ?? 0} className="tier-image" />
      <div><p className="tier-name">{tier ? `${tier.name}${tier.division ? ` ${tier.division}` : ""}` : rank?.totalGames === 0 ? "시즌 랭크 기록 없음" : historical ? "시즌 종료 RP" : "티어 확인 대기"}</p>
        <strong className="rp-number">{formatNumber(rank?.rp ?? null)} <small>RP</small></strong>
        {tier && <p className="tier-within">{signedNumber(tier.within)} RP {tier.division ? "· 현재 단계" : "· 미스릴 기준"}</p>}
      </div>
    </div>
    {tier?.progress !== null && tier?.progress !== undefined && <div className="tier-progress"><div><span style={{ width: `${tier.progress}%` }} /></div><p>다음 단계까지 <strong>{formatNumber(tier.next)} RP</strong></p></div>}
    {tier && tier.division === null && <p className="small-note">데미갓·이터니티는 서버별 승급 조건이 필요해 RP만으로 확정하지 않습니다.</p>}
    <div className="ladder-ranks"><span>전체 순위 <strong>{formatNumber(rank?.rank ?? null)}위</strong></span><span>서버 순위 <strong>{formatNumber(rank?.serverRank ?? null)}위</strong></span>
      {rank?.rankPercent !== null && rank?.rankPercent !== undefined && <span>상위 <strong>{formatNumber(rank.rankPercent, 2)}%</strong></span>}</div>
    <div className="season-totals"><div><span>시즌 경기</span><strong>{formatNumber(rank?.totalGames ?? null)}</strong></div><div><span>시즌 승률</span><strong>{formatNumber(rank?.totalGames && rank.totalWins !== null ? rank.totalWins / rank.totalGames * 100 : null, 1)}<small>%</small></strong></div><div><span>평균 TK</span><strong>{formatNumber(rank?.averageTeamKills ?? null, 2)}</strong></div></div>
    {player.rankedNotice && <p className="ranked-notice">{player.rankedNotice}</p>}
  </section>;
}

export function RPChart({ player }: { player: PlayerData }) {
  const [days, setDays] = useState<number | "season">("season");
  const [view, setView] = useState<"rp" | "gain">("rp");
  const data = dailyRPHistory(player.matches, {
    seasonId: player.season?.id ?? player.ranked?.seasonId, days, asOf: player.fetchedAt,
    startDate: player.season?.startDate, endDate: player.season?.endDate,
  });
  const observedDays = data.filter((point) => point.games > 0);
  const games = data.reduce((sum, point) => sum + point.games, 0);
  const gainGames = data.reduce((sum, point) => sum + point.gainGames, 0);
  const total = gainGames ? data.reduce((sum, point) => sum + (point.gain ?? 0), 0) : null;
  const hasRp = data.some((point) => point.rp !== null);
  const actualView = view === "rp" && hasRp ? "rp" : "gain";
  const hasValues = data.some((point) => point[actualView] !== null);
  return <section className="rp-chart-card" aria-label="날짜별 랭크 점수 변화">
    <div className="section-heading">
      <div><h3><TrendingUp size={17} /> 점수 변화</h3><p>{player.ranked?.seasonName ?? "최근 플레이 시즌"} · 랭크 스쿼드 · 날짜별</p></div>
      <select aria-label="점수 그래프 기간" value={days} onChange={(e) => setDays(e.target.value === "season" ? "season" : Number(e.target.value))}>
        <option value="season">시즌 전체</option>
        <option value={7}>최근 7일</option><option value={30}>최근 30일</option><option value={90}>최근 90일</option>
      </select>
    </div>
    <div className="chart-toolbar">
      <div className="chart-total"><strong className={total !== null && total < 0 ? "negative" : "positive"}>{signedNumber(total)} <small>RP</small></strong><span>{observedDays.length}일 · {gainGames}/{games}경기 증감 합계</span></div>
      <div className="chart-switch" role="group" aria-label="점수 그래프 종류">
        <button aria-pressed={actualView === "rp"} disabled={!hasRp} title={!hasRp ? "날짜별 마지막 경기의 RP가 제공되지 않았습니다" : undefined} onClick={() => setView("rp")}>일별 RP</button>
        <button aria-pressed={actualView === "gain"} onClick={() => setView("gain")}>일별 증감</button>
      </div>
    </div>
    {hasValues ? <div className="rp-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <ComposedChart data={data} margin={{ top: 12, right: 15, left: 0, bottom: 4 }} accessibilityLayer>
        <CartesianGrid stroke="#30363c" strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5).replace("-", "/")} tickLine={false} axisLine={false} minTickGap={24} tick={{ fill: "#9ba5b2", fontSize: 12 }} />
        <YAxis width={54} tickLine={false} axisLine={false} allowDecimals={false} tick={{ fill: "#9ba5b2", fontSize: 12 }} domain={actualView === "rp" ? ["dataMin - 30", "dataMax + 30"] : ["auto", "auto"]} />
        <Tooltip filterNull={false} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const point = payload[0].payload as typeof data[number];
          return <div className="chart-tooltip">
            <strong>{point.date.replaceAll("-", ".")} · 한국 시간</strong>
            <span>{point.games ? point.games + "경기 · 증감 " + point.gainGames + "/" + point.games + "경기 제공" : "조회된 경기 없음"}</span>
            <p>마지막 경기 RP <b>{formatNumber(point.rp)}</b></p>
            <p>일별 증감 <b className={point.gain !== null && point.gain < 0 ? "negative" : "positive"}>{signedNumber(point.gain)}</b></p>
          </div>;
        }} />
        {actualView === "rp" ? <Line type="linear" dataKey="rp" name="일별 마지막 RP" stroke="var(--lime)" strokeWidth={2.5} dot={{ r: 3, fill: "#191c21", strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
          : <><ReferenceLine y={0} stroke="#77828d" /><Bar dataKey="gain" name="일별 RP 증감" maxBarSize={27} radius={[3, 3, 0, 0]} isAnimationActive={false}>{data.map((point) => <Cell key={point.date} fill={point.gain !== null && point.gain < 0 ? "var(--destructive)" : "var(--lime)"} />)}</Bar></>}
      </ComposedChart>
    </ResponsiveContainer></div> : <div className="chart-empty"><TrendingUp size={28} /><p>{games ? "이 기간의 RP 정보가 제공되지 않았습니다." : "이 기간에 날짜가 확인된 랭크 경기가 없습니다."}</p></div>}
    <div className="chart-caption"><span>한국 시간 · 경기 시작일 기준</span><span>{actualView === "rp" ? "그날 마지막 경기의 종료 RP" : "그날 경기의 RP 증감 합계"}</span></div>
    <p className="chart-sample-note">조회된 경기만 반영합니다. {actualView === "rp" ? "점수가 기록된 날짜를 선으로 연결합니다." : "기록이나 점수가 없는 날짜는 비워 표시합니다."}</p>
    {observedDays.length > 0 && <details className="chart-data"><summary>날짜별 점수 표 보기</summary><div className="table-scroll"><table>
      <thead><tr><th>날짜</th><th>경기 수</th><th>마지막 RP</th><th>일별 증감</th><th>증감 제공</th></tr></thead>
      <tbody>{observedDays.map((point) => <tr key={point.date}><td>{point.date}</td><td>{point.games}</td><td>{formatNumber(point.rp)}</td><td>{signedNumber(point.gain)}</td><td>{point.gainGames}/{point.games}경기</td></tr>)}</tbody>
    </table></div></details>}
  </section>;
}

export function DetailedMetrics({ matches }: { matches: Match[] }) {
  const s = detailedStats(matches);
  const metrics: [string, number | null, number, string?][] = [
    ["평균 TK", s.averageTeamKills, 2], ["승률", s.winRate, 1, "%"], ["게임 수", s.count, 0],
    ["평균 킬", s.averageKills, 2], ["TOP 2", s.top2, 1, "%"], ["평균 딜량", s.averageDamage, 0],
    ["평균 어시", s.averageAssists, 1], ["TOP 3", s.top3, 1, "%"], ["평균 순위", s.averageRank, 1, "위"],
    ["평균 동물 킬", s.averageHunts, 1], ["평균 획득 크레딧", s.averageCredits, 0], ["평균 시야 점수", s.averageVision, 2],
  ];
  return <section className="detailed-metrics" aria-label="선택한 경기의 상세 지표"><div className="metric-grid">{metrics.map(([label, value, digits, unit]) => <div key={label}><span>{label}</span><strong>{formatNumber(value, digits)}{unit && <small>{unit}</small>}</strong></div>)}</div><p>현재 필터의 {s.count}경기 기준 · TK는 팀 전체 처치 · 미제공 값은 — 표시</p></section>;
}

export function CharacterTable({ matches, onSelect }: { matches: Match[]; onSelect: (code: string) => void }) {
  const groups = new Map<number, Match[]>();
  for (const match of matches) groups.set(match.characterCode, [...(groups.get(match.characterCode) ?? []), match]);
  const rows = [...groups.entries()].map(([code, records]) => ({ code, name: records[0].characterName, ...detailedStats(records) })).sort((a, b) => b.count - a.count);
  return <section className="character-table-card">
    <div className="section-heading"><h3><Trophy size={16} /> 실험체별 성적</h3><span>현재 필터 기준</span></div>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="실험체별 성적 표, 가로 스크롤 가능"><table className="character-table">
      <thead><tr><th>실험체</th><th>승률</th><th>RP 증감</th><th>경기 수</th><th>평균 TK / K</th><th>평균 딜량</th><th>평균 시야 점수</th><th>평균 동물 딜량</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.code}>
        <td><button onClick={() => onSelect(String(row.code))} title={row.name + " 전적만 보기"}><GameImage kind="characters" code={row.code} /><strong>{row.name}</strong></button></td>
        <td>{formatNumber(row.winRate, 1)}%</td>
        <td className={row.rpGain !== null && row.rpGain < 0 ? "negative" : "positive"}>{signedNumber(row.rpGain)}<small>랭크 {row.rpSamples}경기</small></td>
        <td>{row.count}</td>
        <td>{formatNumber(row.averageTeamKills, 2)} <span className="muted-slash">/</span> {formatNumber(row.averageKills, 2)}</td>
        <td>{formatNumber(row.averageDamage)}</td><td>{formatNumber(row.averageVision, 2)}</td><td>{formatNumber(row.averageAnimalDamage)}</td>
      </tr>)}</tbody>
    </table></div>
    {!rows.length && <p className="small-note">선택한 범위에 실험체 기록이 없습니다.</p>}
  </section>;
}
