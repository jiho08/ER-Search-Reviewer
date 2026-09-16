import { createApiHandlers } from "./api-handlers.ts";
import { getPlayer, continueHistory } from "./player-service.ts";

export const localApi = createApiHandlers({
  env: {
    APP_MODE: process.env.APP_MODE, ER_API_KEY: process.env.ER_API_KEY,
    AI_PROVIDER: process.env.AI_PROVIDER, AI_DAILY_LIMIT: process.env.AI_DAILY_LIMIT,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_MODEL: process.env.OPENAI_MODEL,
    CODEX_BRIDGE_URL: process.env.CODEX_BRIDGE_URL, CODEX_BRIDGE_TOKEN: process.env.CODEX_BRIDGE_TOKEN,
  },
  getPlayer, continueHistory,
});
