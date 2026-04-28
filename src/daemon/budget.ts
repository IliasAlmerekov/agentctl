import type { Database } from "bun:sqlite";
import type { Agent } from "../types.ts";

export function getAgent(db: Database, sessionId: string): Agent | null {
  return db
    .query<Agent, string>("SELECT * FROM agents WHERE session_id = ?")
    .get(sessionId);
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
  return (
    agent.token_budget != null && agent.tokens_used >= agent.token_budget
  );
}
