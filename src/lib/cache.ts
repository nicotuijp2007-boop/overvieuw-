import { withDb } from "./db";

/** The cached value for `key` and when it was stored, or null. */
export async function readCache<T>(key: string): Promise<{ value: T; updatedAt: string } | null> {
  const [row] = await withDb((sql) => sql<{ value: T; updated_at: Date }[]>`
    select value, updated_at from usage_dashboard.cache where key = ${key}
  `);
  return row ? { value: row.value, updatedAt: row.updated_at.toISOString() } : null;
}

export async function writeCache(key: string, value: unknown): Promise<void> {
  await withDb((sql) => sql`
    insert into usage_dashboard.cache (key, value, updated_at)
    values (${key}, ${sql.json(value as Parameters<typeof sql.json>[0])}, now())
    on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
  `);
}
