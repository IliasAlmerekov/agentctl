import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_RETENTION_MS,
  assertSupportedSchema,
  cleanupOldRuntimeData,
  getAgents,
  getSchemaVersion,
  initSchema,
  prepareDaemonDatabase,
  reconcileRunningAgents,
  recordDaemonHeartbeat,
  startDaemonRuntime,
} from "./db.ts";

function createTestDb(): Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

describe("database schema metadata", () => {
  test("records the current schema version during schema initialization", () => {
    const db = createTestDb();

    const row = db
      .query<{ value: string }, string>(
        "SELECT value FROM schema_metadata WHERE key = ?",
      )
      .get("schema_version");

    expect(row?.value).toBe(String(CURRENT_SCHEMA_VERSION));
    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
  });

  test("includes runtime current_tool values in getAgents", () => {
    const db = createTestDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_runtime (
        session_id TEXT PRIMARY KEY,
        current_tool TEXT
      );
    `);
    db.run(
      `INSERT INTO agents (session_id, status, started_at)
       VALUES (?, 'running', ?)`,
      ["tool-session", 1_000],
    );
    db.run(
      `INSERT INTO agent_runtime (session_id, current_tool)
       VALUES (?, ?)`,
      ["tool-session", "Bash"],
    );

    const agents = getAgents(db);

    expect(agents).toEqual([
      expect.objectContaining({
        session_id: "tool-session",
        current_tool: "Bash",
      }),
    ]);
  });
});

describe("retention cleanup at scale", () => {
  test("removes old tool_calls and delivered injections from a large dataset", () => {
    const db = createTestDb();
    const now = 1_000_000_000;
    const old = now - 30 * 24 * 60 * 60 * 1_000;
    const fresh = now - 60 * 1_000;

    db.exec("BEGIN TRANSACTION");
    for (let i = 0; i < 10_000; i++) {
      db.run(
        "INSERT INTO tool_calls (session_id, tool_name, arg_hash, called_at) VALUES (?, ?, ?, ?)",
        [`session-${i}`, "Bash", `hash-${i}`, i % 2 === 0 ? old : fresh],
      );
    }
    for (let i = 0; i < 1_000; i++) {
      db.run(
        "INSERT INTO injections (session_id, message, status, created_at, delivered_at) VALUES (?, ?, 'delivered', ?, ?)",
        [`session-${i}`, `msg-${i}`, old, old],
      );
    }
    db.exec("COMMIT");

    cleanupOldRuntimeData(db, now);

    expect(
      db
        .query<{ count: number }, []>("SELECT COUNT(*) as count FROM tool_calls")
        .get()?.count,
    ).toBe(5_000);

    expect(
      db
        .query<{ count: number }, []>("SELECT COUNT(*) as count FROM injections")
        .get()?.count,
    ).toBe(0);
  });
});

describe("schema version guard", () => {
  test("accepts a database with the supported schema version", () => {
    const db = createTestDb();
    expect(() => assertSupportedSchema(db)).not.toThrow();
  });

  test("accepts a database with no schema_metadata table (fresh install)", () => {
    const db = new Database(":memory:");
    expect(() => assertSupportedSchema(db)).not.toThrow();
  });

  test("rejects a database with an unsupported future schema version", () => {
    const db = createTestDb();
    db.run(
      `UPDATE schema_metadata SET value = ? WHERE key = 'schema_version'`,
      [String(CURRENT_SCHEMA_VERSION + 1)],
    );
    expect(() => assertSupportedSchema(db)).toThrow(
      `unsupported schema version ${CURRENT_SCHEMA_VERSION + 1}. ` +
        `This binary supports schema version ${CURRENT_SCHEMA_VERSION}. ` +
        `Upgrade the daemon binary or move ~/.agentctl/agents.db aside.`,
    );
  });

  test("rejects schema_metadata table with no schema_version row", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE schema_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    expect(() => assertSupportedSchema(db)).toThrow(
      /schema_metadata exists but schema_version is missing or unreadable/,
    );
  });

  test("rejects schema_metadata with a malformed schema_version value", () => {
    const db = createTestDb();
    db.run(
      `UPDATE schema_metadata SET value = ? WHERE key = 'schema_version'`,
      ["not-a-number"],
    );
    expect(() => assertSupportedSchema(db)).toThrow(
      /schema_metadata exists but schema_version is missing or unreadable/,
    );
  });
});

describe("daemon database startup reconciliation", () => {
  test("prepares persisted runtime state when the daemon starts", () => {
    const db = createTestDb();
    const now = 20_000;
    const old = 10_000;
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_runtime (
        session_id TEXT PRIMARY KEY,
        current_tool TEXT
      );
    `);

    db.run(
      `INSERT INTO agents (session_id, status, started_at, ended_at)
       VALUES
       ('running-session', 'running', 1_000, NULL),
       ('done-session', 'done', 1_000, 2_000),
       ('killed-session', 'killed', 1_000, 3_000)`,
    );
    db.run(
      `INSERT INTO tool_calls (session_id, tool_name, arg_hash, called_at)
       VALUES ('old-call', 'Bash', 'old-hash', ?)`,
      [old],
    );
    db.run(
      `INSERT INTO injections (session_id, message, status, created_at, delivered_at)
       VALUES
       ('old-delivered', 'old delivered', 'delivered', ?, ?),
       ('old-pending', 'old pending', 'pending', ?, NULL)`,
      [old, old, old],
    );
    db.run(
      `INSERT INTO agent_runtime (session_id, current_tool)
       VALUES ('running-session', 'Bash')`,
    );

    const boot = prepareDaemonDatabase(db, {
      bootId: "restart-boot",
      now,
      retentionMs: 1_000,
    });

    const agents = db
      .query<{ session_id: string; status: string; ended_at: number | null }, []>(
        `SELECT session_id, status, ended_at
         FROM agents
         ORDER BY session_id`,
      )
      .all();
    const toolCallCount = db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM tool_calls")
      .get();
    const injections = db
      .query<{ session_id: string; status: string }, []>(
        "SELECT session_id, status FROM injections ORDER BY session_id",
      )
      .all();
    const runtimeCount = db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM agent_runtime",
      )
      .get();
    const recordedBoot = db
      .query<{ boot_id: string; started_at: number; heartbeat_at: number }, []>(
        "SELECT boot_id, started_at, heartbeat_at FROM daemon_boots",
      )
      .get();

    expect(agents).toEqual([
      { session_id: "done-session", status: "done", ended_at: 2_000 },
      { session_id: "killed-session", status: "killed", ended_at: 3_000 },
      { session_id: "running-session", status: "stale", ended_at: now },
    ]);
    expect(toolCallCount?.count).toBe(0);
    expect(injections).toEqual([{ session_id: "old-pending", status: "pending" }]);
    expect(runtimeCount?.count).toBe(0);
    expect(boot).toEqual({
      boot_id: "restart-boot",
      started_at: now,
      heartbeat_at: now,
    });
    expect(recordedBoot).toEqual(boot);
  });

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
