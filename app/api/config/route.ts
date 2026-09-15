import { getCodexStatus } from "@/lib/server/codex-client";

export async function GET() {
  const aiProvider = process.env.AI_PROVIDER === "codex" ? "codex"
    : process.env.AI_PROVIDER === "rules" ? "rules" : "openai";
  const codexStatus = aiProvider === "codex" ? await getCodexStatus({
    url: process.env.CODEX_BRIDGE_URL, token: process.env.CODEX_BRIDGE_TOKEN,
  }) : undefined;
  return Response.json(
    {
      gameApiConfigured: Boolean(process.env.ER_API_KEY?.trim()),
      aiProvider,
      codexStatus,
      aiConfigured: aiProvider === "codex" ? codexStatus === "ready"
        : aiProvider === "openai" && Boolean(process.env.OPENAI_API_KEY?.trim()),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
