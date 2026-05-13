import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../db.ts";
import { handleSubagent } from "./subagent.ts";

function createTestDb(): Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

describe("handleSubagent", () => {
  test("does not override killed status on stop", () => {
    const db = createTestDb();
    const endedAt = 12_345;
    db.run(
      `INSERT INTO agents (session_id, status, started_at, ended_at)
       VALUES (?, 'killed', ?, ?)`,
      ["killed-session", Date.now() - 1_000, endedAt],
    );

    const result = handleSubagent(
      "stop",
      { session_id: "killed-session" },
      db,
      () => undefined,
    );
    const row = db
      .query<
        { status: string; ended_at: number | null },
        string
      >("SELECT status, ended_at FROM agents WHERE session_id = ?")
      .get("killed-session");

    expect(result).toEqual({ ok: true });
    expect(row?.status).toBe("killed");
    expect(row?.ended_at).toBe(endedAt);
  });

  test("does not override budget_exceeded status on stop", () => {
    const db = createTestDb();
    const endedAt = 54_321;
    db.run(
      `INSERT INTO agents (session_id, status, started_at, ended_at)
       VALUES (?, 'budget_exceeded', ?, ?)`,
      ["budget-session", Date.now() - 1_000, endedAt],
    );

    const result = handleSubagent(
      "stop",
      { session_id: "budget-session" },
      db,
      () => undefined,
    );
    const row = db
      .query<
        { status: string; ended_at: number | null },
        string
      >("SELECT status, ended_at FROM agents WHERE session_id = ?")
      .get("budget-session");

    expect(result).toEqual({ ok: true });
    expect(row?.status).toBe("budget_exceeded");
    expect(row?.ended_at).toBe(endedAt);
  });
});
