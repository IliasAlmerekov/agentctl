import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema, reconcileRunningAgents } from "./db.ts";

function createTestDb(): Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

describe("daemon database startup reconciliation", () => {
  test("marks previously running sessions stale when the daemon starts again", () => {
    const db = createTestDb();
    db.run(
      `INSERT INTO agents (session_id, status, started_at)
       VALUES (?, 'running', ?)`,
      ["stale-session", Date.now() - 10_000],
    );

    reconcileRunningAgents(db);

    const row = db
      .query<{ status: string; ended_at: number | null }, string>(
        "SELECT status, ended_at FROM agents WHERE session_id = ?",
      )
      .get("stale-session");

    expect(row?.status).toBe("stale");
    expect(row?.ended_at).toBeNumber();
  });
});
