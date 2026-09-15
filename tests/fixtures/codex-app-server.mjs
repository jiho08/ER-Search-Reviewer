import { createInterface } from "node:readline";
import assert from "node:assert/strict";

const scenario = process.argv[2] || "success";
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const notify = (method, params) => send({ method, params });
const call = (id, tool, args = {}) => send({ id, method: "item/tool/call", params: {
  threadId: "thread-1", turnId: "turn-1", callId: `call-${id}`, tool, arguments: args,
} });
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    if (scenario === "slow-init") setTimeout(() => send({ id: message.id, result: {} }), 300);
    else send({ id: message.id, result: {} });
    return;
  }
  if (message.method === "account/read") return send({ id: message.id, result: {
    account: { type: scenario === "api-key" ? "apiKey" : "chatgpt" },
  } });
  if (message.method === "config/read") return send({ id: message.id, result: {
    config: { mcp_servers: { existing: { enabled: true } } },
  } });
  if (message.method === "thread/start") {
    const params = message.params;
    assert.equal(params.ephemeral, true);
    assert.equal(params.sandbox, "read-only");
    assert.equal(params.approvalPolicy, "never");
    assert.deepEqual(params.runtimeWorkspaceRoots, [params.cwd]);
    assert.equal(params.config["mcp_servers.existing.enabled"], false);
    assert.equal(params.config["features.shell_tool"], false);
    assert.deepEqual(params.dynamicTools.map((tool) => tool.name), ["get_recent_matches", "analyze_survival"]);
    return send({ id: message.id, result: { thread: { id: "thread-1" }, sandbox: { type: "readOnly" } } });
  }
  if (message.method === "turn/start") {
    assert.equal(message.params.sandboxPolicy.networkAccess, false);
    assert.equal(message.params.approvalPolicy, "never");
    send({ id: message.id, result: { turn: { id: "turn-1" } } });
    notify("turn/started", { threadId: "thread-1", turn: { id: "turn-1" } });
    if (scenario === "quota") {
      notify("turn/completed", { threadId: "thread-1", turn: { id: "turn-1", status: "failed", error: { codexErrorInfo: "usageLimitExceeded" } } });
      return;
    }
    if (scenario === "timeout") return;
    call(91, scenario === "unknown-tool" ? "run_shell" : "get_recent_matches", scenario === "bad-args" ? { command: "anything" } : {});
    return;
  }
  if (message.id === 91 && message.result) {
    assert.equal(message.result.success, true);
    assert.equal(JSON.parse(message.result.contentItems[0].text).count, 3);
    return call(92, scenario === "duplicate-tools" ? "get_recent_matches" : "analyze_survival");
  }
  if (message.id === 92 && message.result) {
    const data = JSON.parse(message.result.contentItems[0].text);
    assert.equal(scenario === "duplicate-tools" ? data.count : data.summary.count, 3);
    notify("item/completed", { threadId: "thread-1", turnId: "turn-1", item: {
      type: "agentMessage", phase: "commentary", text: "이 중간 메시지를 결과로 사용하면 안 됩니다.",
    } });
    notify("item/completed", { threadId: "thread-1", turnId: "turn-1", item: {
      type: "agentMessage", phase: "final_answer", text: JSON.stringify({
        title: "3경기 생존 리뷰", summary: "도구로 계산한 기록입니다.",
        observations: [{ title: "표본 확인", evidence: "3경기입니다.", action: "경기를 더 모아 비교하세요." }],
      }),
    } });
    notify("turn/completed", { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } });
  }
});
