import handler from "vinext/server/fetch-handler";
import { readJsonBody, readBoundedBody } from "../lib/server/api-handlers.ts";
import { AppError, errorResponse } from "../lib/server/errors.ts";
import type { AppEnvironment } from "../lib/server/api-handlers.ts";
export { LumiaState } from "./public-coordinator.ts";

interface PublicEnvironment extends AppEnvironment {
  LUMIA_STATE: DurableObjectNamespace;
}
const worker = {
  async fetch(request: Request, env: PublicEnvironment, ctx: ExecutionContext): Promise<Response> {
    if (env.APP_MODE !== "public" || !env.LUMIA_STATE)
      return Response.json({ error: "공개 서버의 배포 설정을 확인해 주세요." }, { status: 503 });
    const path = new URL(request.url).pathname;
    if (path === "/api" || path.startsWith("/api/")) {
      const apiPath = path.replace(/\/+$/, "");
      if (!(request.method === "GET" && ["/api/config", "/api/player", "/api/player/history"].includes(apiPath)) &&
        !(request.method === "POST" && apiPath === "/api/review")) {
        try { await readBoundedBody(request); }
        catch (error) { return errorResponse(error); }
        return Response.json({ error: "지원하지 않는 API 요청입니다." }, { status: 404 });
      }
      const headers = new Headers(request.headers);
      headers.delete("x-lumia-client");
      headers.set("x-lumia-client-ip", request.headers.get("cf-connecting-ip") || "unknown");
      const stub = env.LUMIA_STATE.get(env.LUMIA_STATE.idFromName("er-site-v1"));
      try {
        // Bound and buffer the body before crossing the service boundary. An
        // early DO rejection must not leave an inbound stream forwarding after
        // the response, which workerd rejects as a cross-request stream read.
        const body = request.method === "POST" ? JSON.stringify(await readJsonBody(request)) : undefined;
        headers.delete("content-length");
        return await stub.fetch(new Request(request.url, { method: request.method, headers, body }));
      } catch (error) {
        if (error instanceof AppError) return errorResponse(error);
        return Response.json({ error: "공유 전적 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
    }
    return handler.fetch(request, env, ctx);
  },
};
export default worker;
