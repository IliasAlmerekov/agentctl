import { addTokens, ensureAgent, getAgent } from "../budget.ts";
import type { Database } from "bun:sqlite";
import type { PostToolUseInput, AgentEvent } from "../../types.ts";
import { clearCurrentTool, getAgents } from "../db.ts";

// Rough estimate: ~4 chars per token for tool I/O
function estimateTokens(input: unknown, response: unknown): number {
  const inputStr = JSON.stringify(input) ?? "";
  const responseStr = JSON.stringify(response) ?? "";
  return Math.ceil((inputStr.length + responseStr.length) / 4);
}

export function handlePostTool(
  input: PostToolUseInput,
  db: Database,
  broadcast: (event: AgentEvent) => void,
): { ok: boolean } {
  const { session_id, tool_input, tool_response, tokens_used } = input;

  const delta = tokens_used ?? estimateTokens(tool_input, tool_response);

  let budgetExceeded = false;
  let budgetMessage = "";

  db.transaction(() => {
    ensureAgent(db, session_id);
    addTokens(db, session_id, delta);
    clearCurrentTool(db, session_id);

    const agent = getAgent(db, session_id);
    if (agent?.token_budget != null && agent.tokens_used >= agent.token_budget && agent.status === "running") {
      db.run(
        "UPDATE agents SET status = 'budget_exceeded', ended_at = ? WHERE session_id = ?",
        [Date.now(), session_id],
      );
      budgetExceeded = true;
      budgetMessage = `Agent ${session_id.slice(0, 8)} exceeded budget (${agent.tokens_used.toLocaleString()} tokens)`;
    }
  })();

  if (budgetExceeded) broadcast({ type: "budget_exceeded", session_id, message: budgetMessage });
  broadcast({ type: "agents_update", agents: getAgents(db) });

  return { ok: true };
}
