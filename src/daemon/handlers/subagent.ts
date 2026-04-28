import type { Database } from "bun:sqlite";
import type { SubagentEventInput, AgentEvent, Agent } from "../../types.ts";
import { getAgents } from "../db.ts";

function computeDepth(db: Database, parentId: string | null): number {
  if (!parentId) return 0;
  const parent = db
    .query<{ depth: number }, string>(
      "SELECT depth FROM agents WHERE session_id = ?",
    )
    .get(parentId);
  return (parent?.depth ?? 0) + 1;
}

export function handleSubagent(
  event: "start" | "stop",
  input: SubagentEventInput,
  db: Database,
  broadcast: (event: AgentEvent) => void,
): { ok: boolean } {
  const { session_id, parent_session_id, description } = input;

  if (event === "start") {
    const depth = computeDepth(db, parent_session_id ?? null);
    db.run(
      `INSERT INTO agents (session_id, parent_id, description, status, depth, tokens_used, started_at)
       VALUES (?, ?, ?, 'running', ?, 0, ?)
       ON CONFLICT(session_id) DO UPDATE SET status = 'running', started_at = excluded.started_at`,
      [session_id, parent_session_id ?? null, description ?? null, depth, Date.now()],
    );
  } else {
    db.run(
      "UPDATE agents SET status = 'done', ended_at = ? WHERE session_id = ?",
      [Date.now(), session_id],
    );
  }

  broadcast({ type: "agents_update", agents: getAgents(db) });
  return { ok: true };
}
