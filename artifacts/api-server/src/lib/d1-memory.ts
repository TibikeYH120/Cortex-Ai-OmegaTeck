// ── Cloudflare D1 long-term memory ─────────────────────────────────────────
// Stores durable facts CORTEX learns about a user (name, preferences, ongoing
// projects, etc.) in the same D1 database used for the search cache, so the
// assistant "remembers" things across conversations.

const CLOUDFLARE_ACCOUNT_ID = "351d7a6d3e58bd7dd1c9b42f2902587e";
const CLOUDFLARE_D1_DATABASE_ID = "696665a6-7f67-4d90-9be5-2eeebe9c9bf2";
const MAX_MEMORIES_PER_OWNER = 30;

let tableReady = false;
let tableInitError = false;

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
      console.error(`[d1-memory] query failed: HTTP ${resp.status}`);
      return null;
    }
    const data = (await resp.json()) as {
      success: boolean;
      result?: Array<{ results: any[] }>;
      errors?: unknown[];
    };
    if (!data.success) {
      console.error(`[d1-memory] query error:`, data.errors);
      return null;
    }
    return data.result?.[0]?.results ?? [];
  } catch (err) {
    console.error(`[d1-memory] request failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function ensureTable(): Promise<void> {
  if (tableReady || tableInitError) return;
  const result = await d1Query(
    `CREATE TABLE IF NOT EXISTS user_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_key TEXT NOT NULL,
      fact TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );`
  );
  if (result === null) {
    tableInitError = true;
  } else {
    tableReady = true;
  }
}

export interface MemoryRow {
  id: number;
  fact: string;
  createdAt: number;
}

export function isMemoryConfigured(): boolean {
  return d1Headers() !== null;
}

/** All remembered facts for a given owner (user or guest), newest first. */
export async function getMemories(ownerKey: string): Promise<MemoryRow[]> {
  await ensureTable();
  if (!tableReady) return [];

  const rows = await d1Query(
    `SELECT id, fact, created_at FROM user_memory WHERE owner_key = ? ORDER BY created_at DESC LIMIT ?;`,
    [ownerKey, MAX_MEMORIES_PER_OWNER]
  );
  if (!rows) return [];
  return rows.map((r: any) => ({ id: r.id, fact: r.fact, createdAt: r.created_at }));
}

/** Add a new fact, skipping near-duplicates and trimming to the most recent N. */
export async function addMemory(ownerKey: string, fact: string): Promise<void> {
  const clean = fact.trim().slice(0, 300);
  if (!clean) return;

  await ensureTable();
  if (!tableReady) return;

  const existing = await getMemories(ownerKey);
  const normalized = clean.toLowerCase();
  if (existing.some(m => m.fact.toLowerCase() === normalized)) return;

  await d1Query(
    `INSERT INTO user_memory (owner_key, fact, created_at) VALUES (?, ?, ?);`,
    [ownerKey, clean, Date.now()]
  );

  // Keep only the most recent MAX_MEMORIES_PER_OWNER facts per owner.
  if (existing.length + 1 > MAX_MEMORIES_PER_OWNER) {
    const overflowIds = existing.slice(MAX_MEMORIES_PER_OWNER - 1).map(m => m.id);
    if (overflowIds.length > 0) {
      await d1Query(
        `DELETE FROM user_memory WHERE id IN (${overflowIds.map(() => "?").join(",")});`,
        overflowIds
      );
    }
  }
}

export async function deleteMemory(ownerKey: string, id: number): Promise<void> {
  await ensureTable();
  if (!tableReady) return;
  await d1Query(`DELETE FROM user_memory WHERE id = ? AND owner_key = ?;`, [id, ownerKey]);
}

export async function clearMemories(ownerKey: string): Promise<void> {
  await ensureTable();
  if (!tableReady) return;
  await d1Query(`DELETE FROM user_memory WHERE owner_key = ?;`, [ownerKey]);
}
