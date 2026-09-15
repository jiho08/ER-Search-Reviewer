"use client";
import { ChevronDown, Info, Check, ArrowUpRight, Sparkles } from "lucide-react";
import { formatDuration, formatNumber, modeLabel } from "@/lib/analysis";
import type { Match, ReviewResult } from "@/lib/types";
import { GameImage } from "@/components/game-image";
import { gameAsset } from "@/lib/game-assets";
import { matchOutcome, signedNumber } from "@/lib/player-metrics";

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
  return <GameImage kind="characters" code={code} label={name} className="character-badge" />;
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
  const outcome = matchOutcome(match);
  const outcomeLabel = outcome === "victory" ? "승리" : outcome === "escape-success" ? "탈출 성공" : outcome === "escape-failure" ? "탈출 실패" : "최종 순위";
  return (
    <div className={`match-card ${outcome}`}>
      <button
        className="match-row rich-match-row"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`detail-${match.id}`}
      >
        <div className="placement">
          <strong>{match.rank === null ? "—" : `#${match.rank}`}</strong>
          <span>{outcomeLabel}</span>
        </div>
        <div className="match-identity"><CharacterBadge code={match.characterCode} name={match.characterName} />
        <div className="match-character">
          <strong>{match.characterName}</strong>
          <span>
            {modeLabel(match.mode)} · Lv.{match.details?.level ?? "—"}
          </span>
        </div></div>
        <div className="match-kda">
          <strong>
            {formatNumber(match.details?.teamKills ?? null)} <i>/</i> {formatNumber(match.kills)}{" "}
            <i>/</i> {formatNumber(match.assists)}
          </strong>
          <span>TK / K / A</span>
        </div>
        <div className="match-damage">
          <strong>{formatNumber(match.damage)}</strong>
          <span>딜량</span>
        </div>
        <div className="match-score"><strong className={match.mode === 3 && match.mmrGain !== null && match.mmrGain < 0 ? "negative" : "positive"}>{match.mode === 3 ? signedNumber(match.mmrGain) : "—"} <small>RP</small></strong><span>{match.mode === 3 ? `${formatNumber(match.details?.rpAfter ?? null)} RP` : "일반 경기"}</span></div>
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
      <div className="match-loadout">
        <div className="match-traits"><div><GameImage kind="traits" code={match.details?.mainTrait ?? null} /><span>{gameAsset("traits", match.details?.mainTrait ?? null)?.name ?? "특성 미제공"}</span></div><div><GameImage kind="tactical" code={match.details?.tacticalSkill ?? null} /><span>{gameAsset("tactical", match.details?.tacticalSkill ?? null)?.name ?? "전술 스킬"}<small>{match.details?.tacticalLevel ? ` Lv.${match.details.tacticalLevel}` : ""}</small></span></div></div>
        <div className="match-equipment" aria-label="최종 장비">{["무기", "옷", "머리", "팔", "다리"].map((label, slot) => <GameImage key={slot} kind="items" code={match.details?.equipment.find((item) => item.slot === slot)?.code ?? null} label={`${label} 미제공`} />)}</div>
      </div>
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
            <span>동물에게 가한 피해량</span>
            <strong>{formatNumber(match.details?.animalDamage ?? null)}</strong>
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
            <span>팀 전체 처치 / 사망</span>
            <strong>{formatNumber(match.details?.teamKills ?? null)} / {formatNumber(match.deaths)}</strong>
          </div>
          <div>
            <span>획득 크레딧</span>
            <strong>{formatNumber(match.details?.credits ?? null)}</strong>
          </div>
          <div>
            <span>시야 기여 점수</span>
            <strong>{formatNumber(match.details?.vision ?? null)}</strong>
          </div>
          <div className="subtrait-detail">
            <span>보조 특성</span>
            <div>{match.details?.subTraits.length ? match.details.subTraits.map((code, index) => <div key={`${code}-${index}`}><GameImage kind="traits" code={code} /><strong>{gameAsset("traits", code)?.name ?? `특성 ${code}`}</strong></div>) : <strong>미제공</strong>}</div>
          </div>
          <div className="equipment-detail">
            <span>최종 장비</span>
            <strong>{match.details?.equipment.length ? match.details.equipment.map((item) => gameAsset("items", item.code)?.name ?? `아이템 ${item.code}`).join(" · ") : "미제공"}</strong>
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
          {review.engine === "codex" ? "Codex 리뷰" : review.engine === "openai" ? "AI 리뷰" : "기본 분석"}
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
