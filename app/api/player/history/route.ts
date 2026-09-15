import { historyCursorSchema, historyIdSchema } from "@/lib/server/validation";
import { continueHistory } from "@/lib/server/player-service";
import { errorResponse } from "@/lib/server/errors";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const id = historyIdSchema.safeParse(query.get("id"));
  const cursor = historyCursorSchema.safeParse(query.get("cursor"));
  if (!id.success || !cursor.success)
    return Response.json({ error: "경기 조회 정보를 확인해 주세요." }, { status: 400 });
  try {
    return Response.json(await continueHistory(id.data, cursor.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return errorResponse(error); }
}
