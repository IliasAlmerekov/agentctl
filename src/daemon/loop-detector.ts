import { createHash } from "crypto";
import type { Database } from "bun:sqlite";

export const DEFAULT_LOOP_WINDOW_MS = 120_000;
export const DEFAULT_LOOP_THRESHOLD = 5;

type LoopDetectorOptions = {
  windowMs?: number;
  threshold?: number;
  now?: number;
};

export function detectLoop(
  sessionId: string,
  toolName: string,
  toolInput: unknown,
  db: Database,
  options: LoopDetectorOptions = {},
): { detected: boolean; count?: number } {
  const windowMs = options.windowMs ?? DEFAULT_LOOP_WINDOW_MS;
  const threshold = options.threshold ?? DEFAULT_LOOP_THRESHOLD;
  const now = options.now ?? Date.now();
  const hash = createHash("sha1")
    .update(JSON.stringify(normalise(toolInput)))
    .digest("hex")
    .slice(0, 12);

  const row = db
    .query<{ count: number }, [string, string, string, number]>(
      `SELECT COUNT(*) as count FROM tool_calls
       WHERE session_id = ? AND tool_name = ? AND arg_hash = ? AND called_at > ?`,
    )
    .get(sessionId, toolName, hash, now - windowMs);

  const priorCount = row?.count ?? 0;
  const countIncludingCurrent = priorCount + 1;
  return countIncludingCurrent >= threshold
    ? { detected: true, count: countIncludingCurrent }
    : { detected: false };
}

function normalise(input: unknown): unknown {
  if (typeof input === "string") return normaliseString(input);
  if (Array.isArray(input)) return input.map((item) => normalise(item));
  if (typeof input !== "object" || input === null) return input;
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .filter(([k]) => !["timestamp", "request_id", "nonce"].includes(k))
      .map(([k, v]) => [k, normalise(v)]),
  );
}

function normaliseString(value: string): string {
  return value
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "<uuid>",
    )
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, "<timestamp>")
    .replace(/\b\d{13}\b/g, "<timestamp>");
}

export function hashArgs(input: unknown): string {
  return createHash("sha1")
    .update(JSON.stringify(normalise(input)))
    .digest("hex")
    .slice(0, 12);
}
