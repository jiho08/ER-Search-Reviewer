import { nicknameSchema, sourceSchema } from "@/lib/server/validation";
import { getPlayer } from "@/lib/server/player-service";
import { errorResponse } from "@/lib/server/errors";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const source = sourceSchema.safeParse(query.get("source") || "live");
  if (!source.success)
    return Response.json(
      { error: "올바른 조회 모드를 선택해 주세요." },
      { status: 400 },
    );
  const nickname = nicknameSchema.safeParse(query.get("nickname"));
  if (source.data === "live" && !nickname.success)
    return Response.json(
      { error: "올바른 닉네임을 입력해 주세요." },
      { status: 400 },
    );
  try {
    return Response.json(
      await getPlayer(
        nickname.success ? nickname.data : "",
        source.data,
        query.get("refresh") === "1",
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
