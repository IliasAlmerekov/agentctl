import { createHash } from "crypto";
import type { Database } from "bun:sqlite";

const WINDOW_MS = 120_000;
const THRESHOLD = 5;

export function detectLoop(
  sessionId: string,
  toolName: string,
  toolInput: unknown,
  db: Database,
): { detected: boolean; count?: number } {
  const hash = createHash("sha1")
    .update(JSON.stringify(normalise(toolInput)))
    .digest("hex")
    .slice(0, 12);

  const row = db
    .query<{ count: number }, [string, string, string, number]>(
      `SELECT COUNT(*) as count FROM tool_calls
       WHERE session_id = ? AND tool_name = ? AND arg_hash = ? AND called_at > ?`,
    )
    .get(sessionId, toolName, hash, Date.now() - WINDOW_MS);

  const count = row?.count ?? 0;
  return count >= THRESHOLD ? { detected: true, count } : { detected: false };
}

function normalise(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([k]) => !["timestamp", "request_id", "nonce"].includes(k))
      .map(([k, v]) => [k, normalise(v)]),
  );
}

export function hashArgs(input: unknown): string {
  return createHash("sha1")
    .update(JSON.stringify(normalise(input)))
    .digest("hex")
    .slice(0, 12);
}
