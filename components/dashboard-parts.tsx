"use client";
import { ChevronDown, Info, Check, ArrowUpRight, Sparkles } from "lucide-react";
import { formatDuration, formatNumber, modeLabel } from "@/lib/analysis";
import type { Match, ReviewResult } from "@/lib/types";

export function Sparkline({
  values,
  color = "var(--lime)",
}: {
  values: (number | null)[];
  color?: string;
}) {
  const data = values
    .filter((v): v is number => v !== null)
    .slice(0, 12)
    .reverse();
  if (data.length < 2) return null;
  const min = Math.min(...data),
    span = Math.max(...data) - min || 1;
  const points = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * 100},${32 - ((v - min) / span) * 26}`,
    )
    .join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 100 36" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function CharacterBadge({ code, name }: { code: number; name: string }) {
  return (
    <span
      className={`character-badge character-${code % 3}`}
      aria-hidden="true"
    >
      {name.slice(0, 1)}
      <span className="badge-cross">+</span>
    </span>
  );
}
export function MatchRow({
  match,
  expanded,
  onToggle,
}: {
  match: Match;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`match-card ${match.rank === 1 ? "victory" : ""}`}>
      <button
        className="match-row"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`detail-${match.id}`}
      >
        <div className="placement">
          <strong>{match.rank === null ? "—" : `#${match.rank}`}</strong>
          <span>{match.rank === 1 ? "승리" : "최종 순위"}</span>
        </div>
        <CharacterBadge code={match.characterCode} name={match.characterName} />
        <div className="match-character">
          <strong>{match.characterName}</strong>
          <span>
            {modeLabel(match.mode)} ·{" "}
            {match.teamMode === 3 ? "스쿼드" : `팀 모드 ${match.teamMode}`}
          </span>
        </div>
        <div className="match-kda">
          <strong>
            {formatNumber(match.kills)} <i>/</i> {formatNumber(match.deaths)}{" "}
            <i>/</i> {formatNumber(match.assists)}
          </strong>
          <span>K / D / A</span>
        </div>
        <div className="match-damage">
          <strong>{formatNumber(match.damage)}</strong>
          <span>플레이어 피해량</span>
        </div>
        <div className="match-time">
          <strong>{formatDuration(match.duration)}</strong>
          <span>
            {match.startedAt
              ? new Date(match.startedAt).toLocaleDateString("ko-KR", {
                  timeZone: "Asia/Seoul",
                  month: "2-digit",
                  day: "2-digit",
                })
              : "일시 미제공"}
          </span>
        </div>
        <ChevronDown size={17} className={expanded ? "rotate" : ""} />
      </button>
      {expanded && (
        <div className="match-detail" id={`detail-${match.id}`}>
          <div>
            <span>플레이어 피해량</span>
            <strong>{formatNumber(match.damage)}</strong>
          </div>
          <div>
            <span>플레이 시간</span>
            <strong>{formatDuration(match.duration)}</strong>
          </div>
          <div>
            <span>받은 피해량</span>
            <strong>{formatNumber(match.damageTaken)}</strong>
          </div>
          <div>
            <span>야생동물 처치</span>
            <strong>{formatNumber(match.hunting)}</strong>
          </div>
          <div>
            <span>RP 변화</span>
            <strong>
              {match.mmrGain === null
                ? "미제공"
                : `${match.mmrGain > 0 ? "+" : ""}${match.mmrGain}`}
            </strong>
          </div>
          <div>
            <span>경기 ID</span>
            <strong>{match.id}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
export function ReviewContent({
  review,
  count,
}: {
  review: ReviewResult | null;
  count: number;
}) {
  if (!review)
    return (
      <section className="review-result">
        <div className="review-empty">
          <div className="review-orbit">
            <Sparkles size={36} />
          </div>
          <span className="eyebrow">PERSONAL PLAY REVIEW</span>
          <h3>
            한 판의 기록을,
            <br />
            다음 판의 힌트로.
          </h3>
          <p>
            리뷰 주제를 고르고 분석을 시작해 보세요.
            <br />
            선택한 {count}경기를 바탕으로 함께 돌아봅니다.
          </p>
        </div>
      </section>
    );
  return (
    <section className="review-result">
      <div className="review-result-heading">
        <span className="eyebrow">YOUR PLAY, IN FOCUS</span>
        <span className="outline-tag">
          {review.engine === "openai" ? "AI 리뷰" : "기본 분석"}
          {review.source === "demo" ? " · 예시" : ""}
        </span>
      </div>
      <h3>{review.title}</h3>
      <p className="review-summary">{review.summary}</p>
      <div className="observations">
        {review.observations.map((o, i) => (
          <article key={i}>
            <span className="observation-number">0{i + 1}</span>
            <div>
              <h4>{o.title}</h4>
              <p>{o.evidence}</p>
              <div className="action-note">
                <ArrowUpRight size={16} />
                <span>{o.action}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="review-limitations">
        <Info size={17} />
        <div>
          {review.limitations.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      </div>
      <details className="tool-trace">
        <summary>
          분석에 사용한 도구 <span>{review.trace.length}개</span>
          <ChevronDown size={15} />
        </summary>
        {review.trace.map((t, i) => (
          <div key={i}>
            <Check size={14} />
            <span>
              <strong>{t.label}</strong>
              <small>{t.result}</small>
            </span>
            <code>{t.name}</code>
          </div>
        ))}
      </details>
    </section>
  );
}
