import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "./db.ts";
import { killAgent } from "./kill.ts";

function createTestDb(): Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

describe("killAgent", () => {
  test("marks a running agent killed", () => {
    const db = createTestDb();
    db.run(
      `INSERT INTO agents (session_id, status, started_at)
       VALUES (?, 'running', ?)`,
      ["running-session", Date.now()],
    );

    const result = killAgent(db, "running-session");
    const row = db
      .query<{ status: string; ended_at: number | null }, string>(
        "SELECT status, ended_at FROM agents WHERE session_id = ?",
      )
      .get("running-session");

    expect(result).toEqual({
      ok: true,
      session_id: "running-session",
      status: "killed",
    });
    expect(row?.status).toBe("killed");
    expect(row?.ended_at).toBeNumber();
  });

  test("returns already_killed without changing ended_at", () => {
    const db = createTestDb();
    db.run(
      `INSERT INTO agents (session_id, status, started_at, ended_at)
       VALUES (?, 'killed', ?, ?)`,
      ["killed-session", Date.now() - 1_000, 12_345],
    );

    const result = killAgent(db, "killed-session");
    const row = db
      .query<{ ended_at: number | null }, string>(
        "SELECT ended_at FROM agents WHERE session_id = ?",
      )
      .get("killed-session");

    expect(result).toEqual({
      ok: true,
      session_id: "killed-session",
      status: "already_killed",
    });
    expect(row?.ended_at).toBe(12_345);
  });

  test("returns not_found when the session does not exist", () => {
    const db = createTestDb();

    const result = killAgent(db, "missing-session");

    expect(result).toEqual({
      ok: true,
      session_id: "missing-session",
      status: "not_found",
    });
  });
});
