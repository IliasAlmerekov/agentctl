import type { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import type { Agent } from "../types.ts";

export const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
export const CURRENT_SCHEMA_VERSION = 1;

export interface DaemonBoot {
  boot_id: string;
  started_at: number;
  heartbeat_at: number;
}

type PrepareDaemonDatabaseOptions = {
  bootId?: string;
  now?: number;
  retentionMs?: number;
};

export function initSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      session_id     TEXT PRIMARY KEY,
      parent_id      TEXT REFERENCES agents(session_id),
      description    TEXT,
      status         TEXT DEFAULT 'running',
      depth          INTEGER DEFAULT 0,
      tokens_used    INTEGER DEFAULT 0,
      token_budget   INTEGER,
      started_at     INTEGER,
      ended_at       INTEGER
    );

    CREATE TABLE IF NOT EXISTS tool_calls (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id     TEXT REFERENCES agents(session_id),
      tool_name      TEXT,
      arg_hash       TEXT,
      called_at      INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_loop
      ON tool_calls(session_id, tool_name, arg_hash, called_at);

    CREATE TABLE IF NOT EXISTS injections (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id     TEXT REFERENCES agents(session_id),
      message        TEXT,
      status         TEXT DEFAULT 'pending',
      created_at     INTEGER,
      delivered_at   INTEGER
    );

    CREATE TABLE IF NOT EXISTS daemon_boots (
      boot_id       TEXT PRIMARY KEY,
      started_at    INTEGER NOT NULL,
      heartbeat_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_metadata (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_runtime (
      session_id     TEXT PRIMARY KEY REFERENCES agents(session_id) ON DELETE CASCADE,
      current_tool   TEXT
    );
  `);
  recordSchemaVersion(db);
}

function recordSchemaVersion(db: Database, now = Date.now()): void {
  db.run(
    `INSERT INTO schema_metadata (key, value, updated_at)
     VALUES ('schema_version', ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at
     WHERE schema_metadata.value != excluded.value`,
    [String(CURRENT_SCHEMA_VERSION), now],
  );
}

export function getSchemaVersion(db: Database): number | null {
  const row = db
    .query<{ value: string }, []>(
      "SELECT value FROM schema_metadata WHERE key = 'schema_version'",
    )
    .get();
  if (!row) return null;

  const version = Number(row.value);
  return Number.isInteger(version) ? version : null;
}

export function assertSupportedSchema(db: Database): void {
  const tableExists = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_metadata'",
    )
    .get();
  if (!tableExists) return;

  const version = getSchemaVersion(db);
  if (version === null) {
    throw new Error(
      "schema_metadata exists but schema_version is missing or unreadable. " +
        "Move ~/.agentctl/agents.db aside to recover.",
    );
  }
  if (version === CURRENT_SCHEMA_VERSION) return;

  throw new Error(
    `unsupported schema version ${version}. ` +
      `This binary supports schema version ${CURRENT_SCHEMA_VERSION}. ` +
      `Upgrade the daemon binary or move ~/.agentctl/agents.db aside.`,
  );
}

export function reconcileRunningAgents(db: Database, now = Date.now()): void {
  db.run(
    "UPDATE agents SET status = 'stale', ended_at = ? WHERE status = 'running'",
    [now],
  );
}

export function prepareDaemonDatabase(
  db: Database,
  options: PrepareDaemonDatabaseOptions = {},
): DaemonBoot {
  const now = options.now ?? Date.now();

  assertSupportedSchema(db);
  initSchema(db);
  clearRuntimeAgentState(db);
  reconcileRunningAgents(db, now);
  cleanupOldRuntimeData(db, now, options.retentionMs);
  return startDaemonRuntime(db, options.bootId, now);
}

export function clearRuntimeAgentState(db: Database): void {
  db.run("DELETE FROM agent_runtime");
}

export function startDaemonRuntime(
  db: Database,
  bootId: string = randomUUID(),
  now = Date.now(),
): DaemonBoot {
  const boot = {
    boot_id: bootId,
    started_at: now,
    heartbeat_at: now,
  };
  db.run(
    `INSERT INTO daemon_boots (boot_id, started_at, heartbeat_at)
     VALUES (?, ?, ?)`,
    [boot.boot_id, boot.started_at, boot.heartbeat_at],
  );
  return boot;
}

export function recordDaemonHeartbeat(
  db: Database,
  bootId: string,
  now = Date.now(),
): void {
  db.run("UPDATE daemon_boots SET heartbeat_at = ? WHERE boot_id = ?", [
    now,
    bootId,
  ]);
}

export function cleanupOldRuntimeData(
  db: Database,
  now = Date.now(),
  retentionMs = DEFAULT_RETENTION_MS,
): void {
  const cutoff = now - retentionMs;
  db.run("DELETE FROM tool_calls WHERE called_at < ?", [cutoff]);
  db.run(
    `DELETE FROM injections
     WHERE status = 'delivered'
       AND delivered_at IS NOT NULL
       AND delivered_at < ?`,
    [cutoff],
  );
}

export function getAgents(db: Database): Agent[] {
  return db
    .query<Agent, []>(
      `SELECT
        agents.session_id,
        agents.parent_id,
        agents.description,
        agents.status,
        agents.depth,
        agents.tokens_used,
        agents.token_budget,
        agents.started_at,
        agents.ended_at,
        agent_runtime.current_tool
       FROM agents
       LEFT JOIN agent_runtime ON agent_runtime.session_id = agents.session_id
       ORDER BY started_at DESC
       LIMIT 100`,
    )
    .all();
}

export function setCurrentTool(
  db: Database,
  sessionId: string,
  toolName: string,
): void {
  db.run(
    `INSERT INTO agent_runtime (session_id, current_tool)
     VALUES (?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       current_tool = excluded.current_tool`,
    [sessionId, toolName],
  );
}

export function clearCurrentTool(db: Database, sessionId: string): void {
  db.run("DELETE FROM agent_runtime WHERE session_id = ?", [sessionId]);
}
