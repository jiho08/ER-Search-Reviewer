import { AppError } from "./errors.ts";
import type { StateStore } from "./state-store.ts";

export type RequestKind = "search" | "history" | "review";
type Counter = { count: number; until: number };
type Lease = { until: number };

// An application-enforced review count cap, not a dollar-denominated billing cap.
export function dailyAiLimit(value?: string): number {
  return value && /^\d+$/.test(value) ? Math.min(Number(value), 1_000) : 0;
}

export function createPublicLimits(store: StateStore, aiLimit: number, now = Date.now) {
  function prune() {
    for (const key of [...store.keys("limit:"), ...store.keys("lease:")]) {
      if ((store.get<Lease>(key)?.until ?? 0) <= now()) store.delete(key);
    }
  }
  function acquire(kind: RequestKind, client: string, paid = false): () => void {
    const instant = now();
    const minuteEnd = (Math.floor(instant / 60_000) + 1) * 60_000;
    const dayEnd = (Math.floor(instant / 86_400_000) + 1) * 86_400_000;
    const ipCap = { search: 6, history: 60, review: 3 }[kind];
    const globalCap = { search: 20, history: 180, review: 12 }[kind];
    const rules: [string, number, number][] = [
      [`limit:${kind}:client:${client}`, ipCap, minuteEnd],
      [`limit:${kind}:global`, globalCap, minuteEnd],
    ];
    if (paid) rules.push(["limit:ai:daily", aiLimit, dayEnd], [`limit:ai:client:${client}`, Math.min(10, aiLimit), dayEnd]);
    let lease: string | undefined;
    store.transaction(() => {
      prune();
      if (kind === "review" && store.keys("lease:").length >= 2)
        throw new AppError("현재 다른 리뷰를 분석 중입니다. 잠시 후 다시 시도해 주세요.", 429, 30);
      for (const [key, cap, until] of rules) {
        const current = store.get<Counter>(key);
        if ((current && current.until > instant ? current.count : 0) >= cap)
          throw new AppError(paid && key.startsWith("limit:ai:")
            ? "오늘의 AI 리뷰 제공 한도에 도달했습니다. 다음 날 다시 이용해 주세요. (UTC 기준)"
            : "요청이 많습니다. 잠시 후 다시 이용해 주세요.", 429, Math.max(1, Math.ceil((until - instant) / 1000)));
      }
      for (const [key, , until] of rules) {
        const current = store.get<Counter>(key);
        store.set(key, { count: (current && current.until > instant ? current.count : 0) + 1, until });
      }
      if (kind === "review") {
        lease = `lease:${crypto.randomUUID()}`;
        // Survives restarts. An interrupted request cannot hold a slot forever.
        store.set(lease, { until: instant + 300_000 });
      }
    });
    // Failed/cancelled paid reviews still consume their reservation; no retry refund.
    return () => { if (lease) store.delete(lease); };
  }
  return { acquire, prune };
}
