import { reviewRequestSchema } from "@/lib/server/validation";
import { getPlayer } from "@/lib/server/player-service";
import { createReview } from "@/lib/server/reviewer";
import { errorResponse } from "@/lib/server/errors";

let running = 0;
let windowStart = 0;
let requests = 0;
export async function POST(request: Request) {
  // Browser calls must come from this site. This is a local demo, not authentication.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 403 },
    );
  if (!request.headers.get("content-type")?.includes("application/json"))
    return Response.json({ error: "JSON 요청이 필요합니다." }, { status: 415 });
  if (Number(request.headers.get("content-length")) > 4096)
    return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 4096)
      return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
    input = JSON.parse(body);
  } catch {
    return Response.json(
      { error: "요청 형식을 확인해 주세요." },
      { status: 400 },
    );
  }
  const parsed = reviewRequestSchema.safeParse(input);
  if (!parsed.success)
    return Response.json(
      { error: "닉네임·모드·리뷰 주제를 확인해 주세요." },
      { status: 400 },
    );
  if (Date.now() - windowStart > 60_000) {
    windowStart = Date.now();
    requests = 0;
  }
  if (running >= 2 || requests >= 12)
    return Response.json(
      { error: "분석 요청이 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  requests++;
  running++;
  try {
    const review = await createReview(parsed.data, {
      getPlayer,
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL,
    });
    return Response.json(review, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  } finally {
    running--;
  }
}
