import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  DEFAULT_RETENTION_MS,
  cleanupOldRuntimeData,
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

describe("runtime data retention cleanup", () => {
  test("deletes old tool calls and delivered injections without deleting pending injections", () => {
    const db = createTestDb();
    const now = 10_000;
    const old = now - DEFAULT_RETENTION_MS - 1;
    const recent = now - DEFAULT_RETENTION_MS + 1;

    db.run(
      `INSERT INTO tool_calls (session_id, tool_name, arg_hash, called_at)
       VALUES
       ('old-call', 'Bash', 'old-hash', ?),
       ('recent-call', 'Bash', 'recent-hash', ?)`,
      [old, recent],
    );
    db.run(
      `INSERT INTO injections (session_id, message, status, created_at, delivered_at)
       VALUES
       ('old-delivered', 'old delivered', 'delivered', ?, ?),
       ('recent-delivered', 'recent delivered', 'delivered', ?, ?),
       ('old-pending', 'old pending', 'pending', ?, NULL)`,
      [old, old, recent, recent, old],
    );

    cleanupOldRuntimeData(db, now);

    const toolCalls = db
      .query<{ session_id: string }, []>(
        "SELECT session_id FROM tool_calls ORDER BY session_id",
      )
      .all();
    const injections = db
      .query<{ session_id: string; status: string }, []>(
        "SELECT session_id, status FROM injections ORDER BY session_id",
      )
      .all();

    expect(toolCalls).toEqual([{ session_id: "recent-call" }]);
    expect(injections).toEqual([
      { session_id: "old-pending", status: "pending" },
      { session_id: "recent-delivered", status: "delivered" },
    ]);
  });

  test("keeps records exactly at the retention cutoff", () => {
    const db = createTestDb();
    const now = 10_000;
    const cutoff = now - DEFAULT_RETENTION_MS;

    db.run(
      `INSERT INTO tool_calls (session_id, tool_name, arg_hash, called_at)
       VALUES ('cutoff-call', 'Bash', 'cutoff-hash', ?)`,
      [cutoff],
    );
    db.run(
      `INSERT INTO injections (session_id, message, status, created_at, delivered_at)
       VALUES ('cutoff-delivered', 'cutoff delivered', 'delivered', ?, ?)`,
      [cutoff, cutoff],
    );

    cleanupOldRuntimeData(db, now);

    const toolCallCount = db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM tool_calls")
      .get();
    const injectionCount = db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM injections")
      .get();

    expect(toolCallCount?.count).toBe(1);
    expect(injectionCount?.count).toBe(1);
  });
});
