import type { Database } from "bun:sqlite";
import type { Agent } from "../types.ts";

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
  `);
}

export function getAgents(db: Database): Agent[] {
  return db
    .query<Agent, []>(
      `SELECT
        session_id, parent_id, description, status,
        depth, tokens_used, token_budget, started_at, ended_at,
        NULL as current_tool
       FROM agents
       ORDER BY started_at DESC
       LIMIT 100`,
    )
    .all();
}
