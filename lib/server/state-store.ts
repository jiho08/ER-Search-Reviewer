// Synchronous storage keeps multi-record changes atomic inside a Durable Object.
// Pages are separate records so a whole season never has to fit in one SQL row.
export interface StateStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
  keys(prefix: string): string[];
  transaction<T>(operation: () => T): T;
}

export function memoryStore(): StateStore {
  const values = new Map<string, unknown>();
  return {
    get: <T>(key: string) => structuredClone(values.get(key)) as T | undefined,
    set: (key, value) => { values.set(key, structuredClone(value)); },
    delete: (key) => { values.delete(key); },
    keys: (prefix) => [...values.keys()].filter((key) => key.startsWith(prefix)),
    transaction: (operation) => {
      const before = new Map(values);
      try { return operation(); } catch (error) {
        values.clear();
        for (const [key, value] of before) values.set(key, value);
        throw error;
      }
    },
  };
}

export function sqliteStore(storage: DurableObjectStorage): StateStore {
  storage.sql.exec("CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  return {
    get: <T>(key: string) => {
      const row = storage.sql.exec<{ value: string }>("SELECT value FROM app_state WHERE key = ?", key).toArray()[0];
      return row ? JSON.parse(row.value) as T : undefined;
    },
    set: (key, value) => {
      storage.sql.exec("INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, JSON.stringify(value));
    },
    delete: (key) => { storage.sql.exec("DELETE FROM app_state WHERE key = ?", key); },
    keys: (prefix) => storage.sql.exec<{ key: string }>(
      "SELECT key FROM app_state WHERE substr(key, 1, ?) = ? ORDER BY rowid", prefix.length, prefix,
    ).toArray().map((row) => row.key),
    transaction: (operation) => storage.transactionSync(operation),
  };
}
