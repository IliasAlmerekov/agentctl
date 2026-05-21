import { detectLoop, hashArgs } from "../loop-detector.ts";
import { ensureAgent, getAgent, isBudgetExceeded } from "../budget.ts";
import { getPendingInjection, markDelivered } from "../injections.ts";
import type { Database } from "bun:sqlite";
import type {
  AgentEvent,
  PreToolUseInput,
  DaemonDecision,
} from "../../types.ts";
import { getAgents, setCurrentTool } from "../db.ts";

export function handlePreTool(
  input: PreToolUseInput,
  db: Database,
  broadcast?: (event: AgentEvent) => void,
): DaemonDecision {
  const { session_id, tool_name, tool_input, cwd } = input;

  let decision: DaemonDecision = { block: false };
  let injectionEvent: { session_id: string; message: string } | null = null;
  let loopEvent: { session_id: string; message: string } | null = null;

  db.transaction(() => {
    ensureAgent(db, session_id, undefined, cwd);

    // 1. Token budget check
    const agent = getAgent(db, session_id);
    if (agent?.status === "killed") {
      decision = {
        block: true,
        reason: `⛔ AGENTCTL: Agent ${session_id} has been killed by the operator. Stop immediately.`,
      };
      return;
    }

    if (agent && isBudgetExceeded(agent)) {
      decision = {
        block: true,
        reason:
          `⚡ AGENTCTL: Token budget exceeded ` +
          `(${agent.tokens_used.toLocaleString()} / ${agent.token_budget!.toLocaleString()} tokens). ` +
          `Summarise your work so far and stop.`,
      };
      return;
    }

    // 2. Pending injection check
    const injection = getPendingInjection(db, session_id);
    if (injection) {
      markDelivered(db, injection.id);
      injectionEvent = { session_id, message: injection.message };
      decision = {
        block: true,
        reason:
          `⚡ STEERING SIGNAL from operator: ${injection.message}\n\n` +
          `Acknowledge this and adjust your current approach accordingly.`,
      };
      return;
    }

    // 3. Loop detection
    const loop = detectLoop(session_id, tool_name, tool_input, db);
    if (loop.detected) {
      const message =
        `${tool_name} called with identical arguments ` +
        `${loop.count}x in the last 2 minutes. Try a different approach.`;
      loopEvent = { session_id, message };
      decision = {
        block: true,
        reason: `⚠️ Loop detected: ${message}`,
      };
      return;
    }

    // 4. Record tool call and allow
    db.run(
      `INSERT INTO tool_calls (session_id, tool_name, arg_hash, called_at)
       VALUES (?, ?, ?, ?)`,
      [session_id, tool_name, hashArgs(tool_input), Date.now()],
    );
    setCurrentTool(db, session_id, tool_name);
  })();

  if (injectionEvent) broadcast?.({ type: "injection_delivered", session_id: injectionEvent.session_id, message: injectionEvent.message });
  if (loopEvent) broadcast?.({ type: "loop_detected", session_id: loopEvent.session_id, message: loopEvent.message });
  if (decision.block === false) broadcast?.({ type: "agents_update", agents: getAgents(db) });

  return decision;
}
