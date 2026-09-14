export type DataSource = "demo" | "live";
export type MatchMode = "all" | "ranked" | "normal";
export type ReviewFocus = "overall" | "combat" | "survival" | "character";
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
}
export interface PlayerData {
  source: DataSource;
  nickname: string;
  uid: string;
  fetchedAt: string;
  matches: Match[];
  notice: string;
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
  engine: "rules" | "openai";
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
}
