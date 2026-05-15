import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "./db.ts";
import { detectLoop, hashArgs } from "./loop-detector.ts";

function createTestDb(): Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

describe("loop detector argument hashing", () => {
  test("normalises volatile values inside command strings and paths", () => {
    const first = hashArgs({
      command:
        "rtk test --log /tmp/agentctl-2026-05-15T10:11:12.123Z-550e8400-e29b-41d4-a716-446655440000/result.json",
    });
    const second = hashArgs({
      command:
        "rtk test --log /tmp/agentctl-2026-05-15T10:12:13.456Z-123e4567-e89b-12d3-a456-426614174000/result.json",
    });

    expect(first).toBe(second);
  });
});

describe("detectLoop", () => {
  test("uses caller-provided threshold and window", () => {
    const db = createTestDb();
    const now = 1_000_000;
    const input = { command: "rtk test" };
    const argHash = hashArgs(input);

    db.run(
      `INSERT INTO tool_calls (session_id, tool_name, arg_hash, called_at)
       VALUES (?, ?, ?, ?)`,
      ["session-a", "Bash", argHash, now - 5_000],
    );
    db.run(
      `INSERT INTO tool_calls (session_id, tool_name, arg_hash, called_at)
       VALUES (?, ?, ?, ?)`,
      ["session-a", "Bash", argHash, now - 30_000],
    );

    expect(
      detectLoop("session-a", "Bash", input, db, {
        threshold: 3,
        windowMs: 10_000,
        now,
      }),
    ).toEqual({ detected: false });
    expect(
      detectLoop("session-a", "Bash", input, db, {
        threshold: 3,
        windowMs: 60_000,
        now,
      }),
    ).toEqual({ detected: true, count: 3 });
  });
});
