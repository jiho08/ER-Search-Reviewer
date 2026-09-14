import { createDemoData } from "../demo.ts";
import { createErClient } from "./er-api.ts";
import type { DataSource } from "../types";
let client: ReturnType<typeof createErClient> | undefined;
let clientKey: string | undefined;
export async function getPlayer(
  nickname: string,
  source: DataSource,
  refresh = false,
) {
  if (source === "demo") return createDemoData();
  const apiKey = process.env.ER_API_KEY || "";
  if (!client || clientKey !== apiKey) {
    client = createErClient(apiKey);
    clientKey = apiKey;
  }
  return client.getPlayer(nickname, refresh);
}
