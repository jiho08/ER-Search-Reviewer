import { createDemoData } from "../demo.ts";
import { createErClient } from "./er-api.ts";
import type { DataSource } from "../types";
let client: ReturnType<typeof createErClient> | undefined;
let clientKey: string | undefined;
function erClient() {
  const apiKey = process.env.ER_API_KEY || "";
  if (!client || clientKey !== apiKey) {
    client = createErClient(apiKey);
    clientKey = apiKey;
  }
  return client;
}
export async function getPlayer(
  nickname: string,
  source: DataSource,
  refresh = false,
  options: { seasonId?: number; historyId?: string; historyPages?: number } = {},
) {
  if (source === "demo") return createDemoData();
  const api = erClient();
  if (options.historyId) return api.getHistoryPlayer(options.historyId, nickname, options.seasonId, options.historyPages);
  return api.getPlayer(nickname, refresh, options.seasonId);
}
export async function continueHistory(id: string, cursor: string) {
  return erClient().continueHistory(id, cursor);
}
