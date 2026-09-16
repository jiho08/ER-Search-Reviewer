import { AppError } from "./errors.ts";
import { memoryStore } from "./state-store.ts";
import type { StateStore } from "./state-store.ts";

export function createRequestGate(store: StateStore = memoryStore(), options: {
  intervalMs?: number; maxPending?: number; now?: () => number;
  sleep?: (ms: number) => Promise<void>;
} = {}) {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let pending = 0;
  let chain = Promise.resolve();
  return async function run<T>(operation: () => Promise<T>): Promise<T> {
    if (pending >= (options.maxPending ?? 10))
      throw new AppError("전적 요청이 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    pending++;
    const previous = chain;
    let release!: () => void;
    chain = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const last = store.get<number>("er:last-request");
      const wait = last === undefined ? 0 : Math.max(0, (options.intervalMs ?? 1_100) - (now() - last));
      if (wait) await sleep(wait);
      store.set("er:last-request", now());
      // Release the start gate immediately. Slow responses must not hold up
      // subsequent starts, but every start still observes the shared interval.
      return operation();
    } finally {
      pending--;
      release();
    }
  };
}
