import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  initSchema,
  reconcileRunningAgents,
  recordDaemonHeartbeat,
  startDaemonRuntime,
} from "./db.ts";

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

describe("daemon runtime metadata", () => {
  test("records the daemon boot id and initial heartbeat timestamp", () => {
    const db = createTestDb();

    const boot = startDaemonRuntime(db, "boot-test", 1_000);

    const row = db
      .query<
        { boot_id: string; started_at: number; heartbeat_at: number },
        string
      >(
        "SELECT boot_id, started_at, heartbeat_at FROM daemon_boots WHERE boot_id = ?",
      )
      .get("boot-test");

    expect(boot).toEqual({
      boot_id: "boot-test",
      started_at: 1_000,
      heartbeat_at: 1_000,
    });
    expect(row).toEqual(boot);
  });

  test("updates heartbeat timestamp for the current daemon boot", () => {
    const db = createTestDb();
    startDaemonRuntime(db, "boot-test", 1_000);

    recordDaemonHeartbeat(db, "boot-test", 2_500);

    const row = db
      .query<{ started_at: number; heartbeat_at: number }, string>(
        "SELECT started_at, heartbeat_at FROM daemon_boots WHERE boot_id = ?",
      )
      .get("boot-test");

    expect(row).toEqual({
      started_at: 1_000,
      heartbeat_at: 2_500,
    });
  });
});
