"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Crosshair,
  FlaskConical,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  CharacterBadge,
  MatchRow,
  ReviewContent,
  Sparkline,
} from "@/components/dashboard-parts";
import { createDemoData } from "@/lib/demo";
import {
  characterStats,
  filterMatches,
  formatNumber,
  summarize,
} from "@/lib/analysis";
import type {
  AppConfig,
  MatchMode,
  PlayerData,
  ReviewFocus,
  ReviewResult,
} from "@/lib/types";

const focusOptions: {
  value: ReviewFocus;
  label: string;
  icon: typeof Target;
}[] = [
  { value: "overall", label: "종합 분석", icon: Sparkles },
  { value: "combat", label: "교전", icon: Swords },
  { value: "survival", label: "생존", icon: Shield },
  { value: "character", label: "실험체", icon: Crosshair },
];
export default function Home() {
  const [player, setPlayer] = useState<PlayerData>(createDemoData);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<MatchMode>("all");
  const [character, setCharacter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(6);
  const [focus, setFocus] = useState<ReviewFocus>("overall");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [tab, setTab] = useState("overview");
  const requestId = useRef(0),
    reviewId = useRef(0);
  const filtered = useMemo(
    () => filterMatches(player.matches, mode, character),
    [player, mode, character],
  );
  const stats = summarize(filtered),
    characters = characterStats(player.matches),
    filteredCharacters = characterStats(filtered);
  const isAI = player.source === "live" && config?.aiConfigured;
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json() as Promise<AppConfig>)
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);
  const resetReview = useCallback(() => {
    reviewId.current++;
    setReview(null);
    setReviewing(false);
    setReviewError("");
  }, []);
  const search = useCallback(
    async (nickname: string, demo = false, refresh = false) => {
      const id = ++requestId.current;
      resetReview();
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/player?nickname=${encodeURIComponent(nickname.trim())}&source=${demo ? "demo" : "live"}${refresh ? "&refresh=1" : ""}`,
        );
        const data = (await response.json()) as PlayerData & { error?: string };
        if (!response.ok)
          throw new Error(data.error || "전적을 불러오지 못했습니다.");
        if (id !== requestId.current) return;
        flushSync(() => {
          setPlayer(data);
          setMode("all");
          setCharacter("all");
          setExpanded(null);
          setVisibleCount(6);
        });
        return {
          ok: true,
          nickname: data.nickname,
          source: data.source,
          count: data.matches.length,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "조회에 실패했습니다.";
        if (id === requestId.current) setError(message);
        return { ok: false, error: message };
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [resetReview],
  );
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: object,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "search_player_records",
            title: "플레이어 전적 검색",
            description:
              "현재 화면에서 닉네임을 검색하고 전적과 통계를 표시합니다. source=demo는 가상 예시입니다.",
            inputSchema: {
              type: "object",
              properties: {
                nickname: { type: "string", minLength: 1, maxLength: 32 },
                source: { type: "string", enum: ["live", "demo"] },
              },
              required: ["nickname", "source"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: true },
            async execute(input: unknown) {
              const value = input as { nickname?: unknown; source?: unknown };
              if (
                !value ||
                typeof value.nickname !== "string" ||
                !value.nickname.trim() ||
                value.nickname.length > 32 ||
                !["live", "demo"].includes(String(value.source))
              )
                throw new Error("닉네임과 조회 모드를 확인해 주세요.");
              const result = await search(
                value.nickname,
                value.source === "demo",
              );
              if (!result?.ok)
                throw new Error(result?.error || "검색이 취소되었습니다.");
              return result;
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional browser capability; ordinary controls remain available. */
    }
    return () => lifecycle.abort();
  }, [search]);
  async function generateReview() {
    const id = ++reviewId.current;
    setReviewing(true);
    setReviewError("");
    setReview(null);
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: player.nickname,
          source: player.source,
          mode,
          character,
          focus,
        }),
      });
      const data = (await response.json()) as ReviewResult & { error?: string };
      if (!response.ok)
        throw new Error(data.error || "리뷰를 생성하지 못했습니다.");
      if (id !== reviewId.current) return;
      setReview(data);
      setTab("review");
    } catch (err) {
      if (id === reviewId.current)
        setReviewError(
          err instanceof Error ? err.message : "리뷰 생성에 실패했습니다.",
        );
    } finally {
      if (id === reviewId.current) setReviewing(false);
    }
  }
  function updateMode(value: string) {
    setMode(value as MatchMode);
    setVisibleCount(6);
    resetReview();
  }
  function updateCharacter(value: string) {
    setCharacter(value);
    setVisibleCount(6);
    resetReview();
  }
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="Lumia 홈">
            <span className="brand-icon">
              <FlaskConical size={23} strokeWidth={2.3} />
            </span>
            <span>
              LUMIA<span className="brand-dot">.</span>
            </span>
            <span className="brand-description">전적 분석실</span>
          </Link>
          <nav aria-label="주 메뉴">
            <a
              className={tab === "overview" ? "active" : ""}
              href="#analysis"
              onClick={() => setTab("overview")}
            >
              전적 분석
            </a>
            <a
              className={tab === "review" ? "active" : ""}
              href="#review"
              onClick={() => setTab("review")}
            >
              플레이 리뷰 <Sparkles size={13} />
            </a>
          </nav>
          <Dialog>
            <DialogTrigger asChild>
              <button className="help-button" aria-label="이용 안내">
                <Info size={16} />
                <span>이용 안내</span>
              </button>
            </DialogTrigger>
            <DialogContent className="help-dialog">
              <DialogHeader>
                <DialogTitle>루미아 분석실 이용 안내</DialogTitle>
                <DialogDescription>
                  내 기록에서 다음 플레이의 힌트를 찾아보세요.
                </DialogDescription>
              </DialogHeader>
              <ol>
                <li>
                  <strong>전적 검색</strong>
                  <p>
                    현재 게임 닉네임을 입력하세요. 공식 API가 제공하는 최근
                    기록을 불러옵니다.
                  </p>
                </li>
                <li>
                  <strong>범위 선택</strong>
                  <p>
                    게임 모드와 실험체를 선택하면 통계와 리뷰에 같은 범위가
                    적용됩니다.
                  </p>
                </li>
                <li>
                  <strong>리뷰 만들기</strong>
                  <p>
                    궁금한 주제를 선택하세요. AI가 연결되지 않은 경우 계산된
                    지표로 기본 분석을 제공합니다.
                  </p>
                </li>
              </ol>
              <p className="small-note">
                예시 모드는 가상 기록입니다. 전적 수치만으로 실제
                동선·포지셔닝·패배 원인을 확정할 수는 없습니다.
              </p>
              <a
                className="text-link"
                href="https://developer.eternalreturn.io/"
                target="_blank"
                rel="noreferrer"
              >
                이터널 리턴 공식 Open API <ArrowUpRight size={15} />
              </a>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      <main id="analysis">
        <section className="search-section">
          <div>
            <p className="eyebrow">ETERNAL RETURN · PERSONAL ANALYTICS</p>
            <h1>
              기록에서 찾는, <span>다음 플레이.</span>
            </h1>
            <p className="intro">전적을 살펴보고 나만의 플레이를 돌아보세요.</p>
          </div>
          <form
            className="search-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) void search(query);
            }}
          >
            <label className="sr-only" htmlFor="nickname">
              이터널 리턴 닉네임
            </label>
            <Search size={21} />
            <input
              id="nickname"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={32}
              placeholder="플레이어 닉네임을 입력하세요"
              required
              autoComplete="off"
            />
            <button type="submit" aria-label="전적 검색" disabled={loading}>
              {loading ? (
                <LoaderCircle className="spin" size={19} />
              ) : (
                <>
                  <span>전적 검색</span>
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
        </section>
        {error && (
          <div className="error-banner" role="alert">
            <Info size={18} />
            <span>{error}</span>
            <button aria-label="오류 닫기" onClick={() => setError("")}>
              <X size={17} />
            </button>
          </div>
        )}
        {player.source === "demo" ? (
          <div className="demo-banner">
            <span className="demo-label">DEMO</span>
            <p>
              지금은 <strong>가상 전적</strong>을 보고 있어요. 필터·리뷰 기능을
              자유롭게 둘러보세요.
            </p>
            <span className="demo-end">
              예시 데이터 <ArrowUpRight size={14} />
            </span>
          </div>
        ) : (
          <div className="live-banner">
            <Check size={16} />
            <p>공식 API에서 조회한 전적 · {player.notice}</p>
            <button onClick={() => void search("", true)}>예시 보기</button>
          </div>
        )}
        <section
          className={`player-section ${loading ? "is-loading" : ""}`}
          aria-busy={loading}
        >
          <div className="profile-avatar">
            <Crosshair size={35} />
            <span>ER</span>
          </div>
          <div className="profile-text">
            <div className="profile-name">
              <h2>{player.nickname}</h2>
              <span className="outline-tag">
                {player.source === "demo" ? "예시 플레이어" : "플레이어"}
              </span>
            </div>
            <p>
              <span>
                조회된 경기 <strong>{player.matches.length}</strong>
              </span>
              <span className="separator">/</span>
              {player.source === "demo" ? "가상 스쿼드 전적" : "최근 전적 기준"}
            </p>
          </div>
          <button
            className="refresh-button"
            aria-label="전적 새로고침"
            disabled={loading}
            onClick={() =>
              void search(player.nickname, player.source === "demo", true)
            }
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            전적 새로고침
          </button>
        </section>
        <Tabs value={tab} onValueChange={setTab} className="analysis-tabs">
          <div className="tabs-row">
            <TabsList variant="line" className="main-tabs">
              <TabsTrigger value="overview">전적 개요</TabsTrigger>
              <TabsTrigger value="review">
                플레이 리뷰 <Sparkles size={15} />
              </TabsTrigger>
            </TabsList>
            <span className="sample-note">
              현재 필터 · {stats.count}경기 기준
            </span>
          </div>
          <div className="filter-row">
            <div className="filter-controls">
              <Select value={mode} onValueChange={updateMode}>
                <SelectTrigger aria-label="게임 모드" className="filter-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 모드</SelectItem>
                  <SelectItem value="ranked">랭크</SelectItem>
                  <SelectItem value="normal">일반</SelectItem>
                </SelectContent>
              </Select>
              <Select value={character} onValueChange={updateCharacter}>
                <SelectTrigger aria-label="실험체" className="filter-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 실험체</SelectItem>
                  {characters.map((c) => (
                    <SelectItem key={c.code} value={String(c.code)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="filter-caption">
              <Activity size={14} />
              {player.source === "demo" ? "예시 경기 분석" : "조회된 경기 분석"}
            </span>
          </div>
          <section className="metrics" aria-label="전적 요약">
            <article className="metric">
              <div className="metric-label">
                평균 순위
                <Trophy size={17} />
              </div>
              <div className="metric-value">
                <span className="value-prefix">#</span>
                {formatNumber(stats.averageRank, 1)}
                <Sparkline
                  values={filtered.map((m) =>
                    m.rank === null ? null : -m.rank,
                  )}
                />
              </div>
              <p>
                {stats.rankChange === null
                  ? "최근 조회 경기의 최종 순위"
                  : stats.rankChange === 0
                    ? "이전 경기와 평균 순위 동일"
                    : `이전 ${Math.floor(stats.count / 2)}경기보다 ${Math.abs(stats.rankChange).toFixed(1)}위 ${stats.rankChange > 0 ? "상승" : "하락"}`}
              </p>
            </article>
            <article className="metric">
              <div className="metric-label">
                승률
                <Target size={17} />
              </div>
              <div className="metric-value">
                {formatNumber(stats.winRate, 1)}
                <span className="value-unit">%</span>
                <div className="win-bar">
                  <span style={{ width: `${stats.winRate ?? 0}%` }} />
                </div>
              </div>
              <p>
                <span className="lime-text">{stats.wins}승</span> /{" "}
                {stats.count}경기 · 최종 1위 기준
              </p>
            </article>
            <article className="metric">
              <div className="metric-label">
                평균 처치
                <Swords size={17} />
              </div>
              <div className="metric-value">
                {formatNumber(stats.averageKills, 1)}
                <Sparkline
                  values={filtered.map((m) => m.kills)}
                  color="var(--cyan)"
                />
              </div>
              <p>평균 어시스트 {formatNumber(stats.averageAssists, 1)}</p>
            </article>
            <article className="metric">
              <div className="metric-label">
                평균 피해량
                <Crosshair size={17} />
              </div>
              <div className="metric-value">
                {formatNumber(stats.averageDamage)}
                <Sparkline
                  values={filtered.map((m) => m.damage)}
                  color="var(--purple)"
                />
              </div>
              <p>플레이어에게 가한 피해량</p>
            </article>
          </section>
          <div className="content-grid">
            <div className="primary-column">
              <TabsContent value="overview">
                <section className="match-section">
                  <div className="section-heading">
                    <h3>
                      최근 경기 <span>{stats.count}</span>
                    </h3>
                    <span>
                      <Clock3 size={13} />
                      최근 경기순
                    </span>
                  </div>
                  {filtered.length ? (
                    <>
                      <div className="matches">
                        {filtered.slice(0, visibleCount).map((match) => (
                          <MatchRow
                            key={match.id}
                            match={match}
                            expanded={expanded === match.id}
                            onToggle={() =>
                              setExpanded(
                                expanded === match.id ? null : match.id,
                              )
                            }
                          />
                        ))}
                      </div>
                      {visibleCount < filtered.length && (
                        <button
                          className="load-more"
                          onClick={() => setVisibleCount((v) => v + 6)}
                        >
                          경기 더 보기 <ChevronDown size={16} />
                          <span>
                            {visibleCount} / {filtered.length}
                          </span>
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="empty-state">
                      <Search size={28} />
                      <h3>표시할 경기가 없어요</h3>
                      <p>
                        다른 모드나 실험체를 선택해 보세요. 실제 전적은 최근
                        90일과 현재 닉네임 사용 기간에 한해 제공됩니다.
                      </p>
                    </div>
                  )}
                </section>
                <section className="rank-history">
                  <div className="section-heading">
                    <h3>순위 흐름</h3>
                    <span>최근 최대 20경기 · 오래된 순</span>
                  </div>
                  <div className="rank-bars" aria-label="경기별 최종 순위">
                    {filtered
                      .slice(0, 20)
                      .reverse()
                      .map((m, i) => (
                        <div
                          key={m.id}
                          title={`${m.characterName} · ${m.rank ?? "미제공"}위`}
                        >
                          <span
                            className={m.rank === 1 ? "win" : ""}
                            style={{
                              height: `${m.rank === null ? 4 : Math.max(12, 100 - (m.rank - 1) * 10)}%`,
                            }}
                          >
                            {m.rank === null ? "—" : m.rank}
                          </span>
                          <small>{i + 1}</small>
                        </div>
                      ))}
                  </div>
                  <p>막대가 높을수록 높은 순위로 마무리한 경기입니다.</p>
                </section>
              </TabsContent>
              <TabsContent value="review" id="review">
                <ReviewContent review={review} count={stats.count} />
              </TabsContent>
            </div>
            <aside className="secondary-column">
              <section className="review-panel">
                <div className="review-panel-top">
                  <span className="ai-icon">
                    <Sparkles size={21} />
                  </span>
                  <span className="review-tag">PLAY REVIEW</span>
                </div>
                <h3>나의 다음 플레이는?</h3>
                <p>
                  기록 속 강점과 아쉬운 점을 찾아
                  <br />
                  다음 경기의 목표를 세워보세요.
                </p>
                <div
                  className="focus-options"
                  role="group"
                  aria-label="리뷰 주제"
                >
                  {focusOptions.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      className={focus === value ? "selected" : ""}
                      aria-pressed={focus === value}
                      onClick={() => {
                        setFocus(value);
                        resetReview();
                      }}
                      disabled={reviewing}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  className="review-button"
                  onClick={() => void generateReview()}
                  disabled={reviewing || loading || !filtered.length}
                >
                  {reviewing ? (
                    <>
                      <LoaderCircle size={18} className="spin" />
                      분석 중…
                    </>
                  ) : (
                    <>
                      <Sparkles size={17} />
                      {isAI ? "AI 리뷰 만들기" : "분석 리뷰 만들기"}
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
                <p className="review-footnote">
                  {isAI
                    ? "선택한 전적 지표를 AI에 전달해 분석합니다."
                    : "계산된 지표를 바탕으로 기본 분석을 제공합니다."}
                </p>
                {reviewError && (
                  <p className="review-error" role="alert">
                    {reviewError}
                  </p>
                )}
              </section>
              <section className="characters-panel">
                <div className="section-heading">
                  <h3>주요 실험체</h3>
                  <Crosshair size={16} />
                </div>
                {filteredCharacters.slice(0, 4).map((c, i) => (
                  <button
                    key={c.code}
                    className="character-stat"
                    onClick={() => updateCharacter(String(c.code))}
                  >
                    <span className="character-order">0{i + 1}</span>
                    <CharacterBadge code={c.code} name={c.name} />
                    <div>
                      <strong>{c.name}</strong>
                      <span>
                        {c.count}경기 · 평균 {formatNumber(c.averageRank, 1)}위
                      </span>
                    </div>
                    <div className="character-win">
                      <strong>
                        {formatNumber(c.winRate, 0)}
                        <small>%</small>
                      </strong>
                      <span>승률</span>
                    </div>
                  </button>
                ))}
                {!filteredCharacters.length && (
                  <p className="small-note">조회된 실험체가 없습니다.</p>
                )}
              </section>
              <div className="data-note">
                <Info size={16} />
                <p>
                  통계는 조회된 경기만 반영합니다.
                  <br />
                  전체 시즌 성적과 다를 수 있어요.
                </p>
              </div>
            </aside>
          </div>
        </Tabs>
      </main>
      <footer>
        <Link className="footer-brand" href="/">
          LUMIA.
        </Link>
        <p>
          이터널 리턴 플레이어를 위한 개인 프로젝트
          <br />
          <span>
            Eternal Return is a registered trademark of Nimble Neuron.
          </span>
        </p>
        <span>기록하고, 돌아보고, 성장하기.</span>
      </footer>
    </div>
  );
}
