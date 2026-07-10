// ── Cloudflare D1 search cache ─────────────────────────────────────────────
// Caches web search results in a Cloudflare D1 database so repeated queries
// don't need a fresh Tavily API call every time. Falls back silently (no
// cache) if Cloudflare credentials or the database are not reachable.

const CLOUDFLARE_ACCOUNT_ID = "351d7a6d3e58bd7dd1c9b42f2902587e";
const CLOUDFLARE_D1_DATABASE_ID = "696665a6-7f67-4d90-9be5-2eeebe9c9bf2";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — search results stay "napra kész" (fresh)

let cacheReady = false;
let cacheInitError = false;

function d1Headers(): Record<string, string> | null {
  const email = process.env["CLOUDFLARE_EMAIL"];
  const key = process.env["CLOUDFLARE_API_KEY"];
  if (!email || !key) return null;
  return {
    "X-Auth-Email": email,
    "X-Auth-Key": key,
    "Content-Type": "application/json",
  };
}

async function d1Query(sql: string, params: unknown[] = []): Promise<any[] | null> {
  const headers = d1Headers();
  if (!headers) return null;

  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${CLOUDFLARE_D1_DATABASE_ID}/query`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ sql, params }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!resp.ok) {
      console.error(`[d1-cache] query failed: HTTP ${resp.status}`);
      return null;
    }
    const data = (await resp.json()) as {
      success: boolean;
      result?: Array<{ results: any[] }>;
      errors?: unknown[];
    };
    if (!data.success) {
      console.error(`[d1-cache] query error:`, data.errors);
      return null;
    }
    return data.result?.[0]?.results ?? [];
  } catch (err) {
    console.error(`[d1-cache] request failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function ensureTable(): Promise<void> {
  if (cacheReady || cacheInitError) return;
  const result = await d1Query(
    `CREATE TABLE IF NOT EXISTS search_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_key TEXT UNIQUE NOT NULL,
      query TEXT NOT NULL,
      results TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );`
  );
  if (result === null) {
    cacheInitError = true;
  } else {
    cacheReady = true;
  }
}

function normalizeKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Fetch cached search results for a query, if fresh (within CACHE_TTL_MS). */
export async function getCachedSearch<T>(query: string): Promise<T | null> {
  await ensureTable();
  if (!cacheReady) return null;

  const key = normalizeKey(query);
  const rows = await d1Query(
    `SELECT results, created_at FROM search_cache WHERE query_key = ? LIMIT 1;`,
    [key]
  );
  if (!rows || rows.length === 0) return null;

  const row = rows[0] as { results: string; created_at: number };
  const age = Date.now() - row.created_at;
  if (age > CACHE_TTL_MS) return null;

  try {
    return JSON.parse(row.results) as T;
  } catch {
    return null;
  }
}

/** Store fresh search results in the cache (upsert). */
export async function setCachedSearch<T>(query: string, results: T): Promise<void> {
  await ensureTable();
  if (!cacheReady) return;

  const key = normalizeKey(query);
  await d1Query(
    `INSERT INTO search_cache (query_key, query, results, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(query_key) DO UPDATE SET
       results = excluded.results,
       created_at = excluded.created_at;`,
    [key, query, JSON.stringify(results), Date.now()]
  );
}

export function isD1Configured(): boolean {
  return d1Headers() !== null;
}

/** Cache stats for the admin panel: total cached queries + how many are still fresh. */
export async function getCacheStats(): Promise<{
  configured: boolean;
  totalCached: number;
  freshCached: number;
} | null> {
  if (!isD1Configured()) return { configured: false, totalCached: 0, freshCached: 0 };

  await ensureTable();
  if (!cacheReady) return null;

  const cutoff = Date.now() - CACHE_TTL_MS;
  const rows = await d1Query(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as fresh
     FROM search_cache;`,
    [cutoff]
  );
  if (!rows || rows.length === 0) return null;

  const row = rows[0] as { total: number; fresh: number | null };
  return {
    configured: true,
    totalCached: Number(row.total ?? 0),
    freshCached: Number(row.fresh ?? 0),
  };
}
