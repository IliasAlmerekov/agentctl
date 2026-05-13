import { addTokens, ensureAgent, getAgent } from "../budget.ts";
import type { Database } from "bun:sqlite";
import type { PostToolUseInput, AgentEvent } from "../../types.ts";
import { getAgents } from "../db.ts";

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

  ensureAgent(db, session_id);

  const delta = tokens_used ?? estimateTokens(tool_input, tool_response);
  addTokens(db, session_id, delta);

  const agent = getAgent(db, session_id);
  if (
    agent?.token_budget != null &&
    agent.tokens_used >= agent.token_budget
  ) {
    broadcast({
      type: "budget_exceeded",
      session_id,
      message: `Agent ${session_id.slice(0, 8)} exceeded budget (${agent.tokens_used.toLocaleString()} tokens)`,
    });
  }

  broadcast({ type: "agents_update", agents: getAgents(db) });

  return { ok: true };
}
