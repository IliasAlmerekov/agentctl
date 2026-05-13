import type { Database } from "bun:sqlite";
import type { Agent } from "../types.ts";

export function getAgent(db: Database, sessionId: string): Agent | null {
  return db
    .query<Agent, string>("SELECT * FROM agents WHERE session_id = ?")
    .get(sessionId);
}

export function ensureAgent(
  db: Database,
  sessionId: string,
  now: number = Date.now(),
): void {
  db.run(
    `INSERT INTO agents (session_id, status, depth, tokens_used, started_at)
     VALUES (?, 'running', 0, 0, ?)
     ON CONFLICT(session_id) DO NOTHING`,
    [sessionId, now],
  );
}

export function setBudget(
  db: Database,
  sessionId: string,
  tokens: number,
): void {
  db.run("UPDATE agents SET token_budget = ? WHERE session_id = ?", [
    tokens,
    sessionId,
  ]);
}

export function addTokens(
  db: Database,
  sessionId: string,
  tokens: number,
): void {
  db.run(
    "UPDATE agents SET tokens_used = tokens_used + ? WHERE session_id = ?",
    [tokens, sessionId],
  );
}

export function isBudgetExceeded(agent: Agent): boolean {
  return agent.token_budget != null && agent.tokens_used >= agent.token_budget;
}
