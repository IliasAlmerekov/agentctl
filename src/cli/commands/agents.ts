import { apiAgents } from "../api.ts";
import type { Agent } from "../../types.ts";

function statusSymbol(status: Agent["status"]): string {
  switch (status) {
    case "running": return "●";
    case "done":    return "✓";
    case "killed":  return "✗";
    case "budget_exceeded": return "⚡";
  }
}

export async function cmdAgents(opts: { json?: boolean }) {
  try {
    const agents = await apiAgents();
    if (opts.json) {
      console.log(JSON.stringify(agents, null, 2));
      return;
    }
    if (agents.length === 0) {
      console.log("no agents recorded");
      return;
    }
    for (const a of agents) {
      const indent = "  ".repeat(a.depth);
      const budget = a.token_budget
        ? `${a.tokens_used.toLocaleString()} / ${a.token_budget.toLocaleString()}`
        : `${a.tokens_used.toLocaleString()} tokens`;
      const label = a.description ?? a.session_id.slice(0, 12);
      console.log(`${indent}${statusSymbol(a.status)} ${label}  [${budget}]`);
    }
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
