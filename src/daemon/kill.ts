import type { Database } from "bun:sqlite";
import type { KillResult } from "../types.ts";

export function killAgent(db: Database, sessionId: string): KillResult {
  const agent = db
    .query<{ status: string }, string>(
      "SELECT status FROM agents WHERE session_id = ?",
    )
    .get(sessionId);

  if (!agent) {
    return { ok: true, session_id: sessionId, status: "not_found" };
  }

  if (agent.status === "killed") {
    return { ok: true, session_id: sessionId, status: "already_killed" };
  }

  db.run(
    "UPDATE agents SET status = 'killed', ended_at = ? WHERE session_id = ?",
    [Date.now(), sessionId],
  );

  return { ok: true, session_id: sessionId, status: "killed" };
}
