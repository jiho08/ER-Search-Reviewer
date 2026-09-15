export type DataSource = "demo" | "live";
export type MatchMode = "all" | "ranked" | "normal";
export type ReviewFocus = "overall" | "combat" | "survival" | "character";
export interface Season {
  id: number;
  name: string;
  isCurrent: boolean;
  startDate: string | null;
  endDate: string | null;
}
export interface MatchHistory {
  id: string;
  next: string | null;
  pages: number;
  exhausted: boolean;
}
export interface HistoryPage {
  matches: Match[];
  history: MatchHistory;
}
export interface MatchDetails {
  level: number | null;
  teamKills: number | null;
  credits: number | null;
  vision: number | null;
  animalDamage: number | null;
  escapeState: number | null;
  rpBefore: number | null;
  rpAfter: number | null;
  equipment: { slot: number; code: number }[];
  mainTrait: number | null;
  subTraits: number[];
  tacticalSkill: number | null;
  tacticalLevel: number | null;
}
export interface RankedProfile {
  seasonId: number;
  seasonName: string;
  rp: number | null;
  rank: number | null;
  serverRank: number | null;
  serverCode: number | null;
  rankPercent: number | null;
  totalGames: number | null;
  totalWins: number | null;
  averageRank: number | null;
  averageTeamKills: number | null;
}
export interface Match {
  id: string;
  characterCode: number;
  characterName: string;
  mode: number;
  teamMode: number;
  seasonId: number | null;
  startedAt: string | null;
  rank: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  damage: number | null;
  damageTaken: number | null;
  hunting: number | null;
  duration: number | null;
  mmrGain: number | null;
  details?: MatchDetails;
}
export interface PlayerData {
  source: DataSource;
  nickname: string;
  uid: string;
  fetchedAt: string;
  matches: Match[];
  notice: string;
  accountLevel?: number | null;
  ranked?: RankedProfile | null;
  rankedNotice?: string;
  seasons?: Season[];
  season?: Season | null;
  history?: MatchHistory;
}
export interface Summary {
  count: number;
  wins: number;
  winRate: number | null;
  averageRank: number | null;
  averageKills: number | null;
  averageDamage: number | null;
  averageDuration: number | null;
  averageAssists: number | null;
  averageDeaths: number | null;
  rankChange: number | null;
}
export interface ToolTrace {
  name: string;
  label: string;
  result: string;
}
export interface ReviewResult {
  engine: "rules" | "openai" | "codex";
  source: DataSource;
  focus: ReviewFocus;
  title: string;
  summary: string;
  observations: { title: string; evidence: string; action: string }[];
  limitations: string[];
  trace: ToolTrace[];
  generatedAt: string;
}
export interface AppConfig {
  gameApiConfigured: boolean;
  aiConfigured: boolean;
  aiProvider: "codex" | "openai" | "rules";
  codexStatus?: "ready" | "login-required" | "unavailable";
}
