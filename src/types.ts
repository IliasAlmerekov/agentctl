export interface PreToolUseInput {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface PostToolUseInput {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
  tokens_used?: number;
}

export interface SubagentEventInput {
  session_id: string;
  parent_session_id?: string;
  description?: string;
}

export interface DaemonDecision {
  block: boolean;
  reason?: string;
  updatedInput?: unknown;
}

export interface Agent {
  session_id: string;
  parent_id: string | null;
  description: string | null;
  status: "running" | "done" | "killed" | "budget_exceeded" | "stale";
  depth: number;
  tokens_used: number;
  token_budget: number | null;
  started_at: number;
  ended_at: number | null;
  current_tool: string | null;
}

export interface Injection {
  id: number;
  session_id: string;
  message: string;
  status: "pending" | "delivered";
  created_at: number;
  delivered_at: number | null;
}

export type AgentEvent =
  | { type: "agents_update"; agents: Agent[] }
  | { type: "loop_detected"; session_id: string; message: string }
  | { type: "budget_exceeded"; session_id: string; message: string }
  | { type: "injection_delivered"; session_id: string; message: string };

export interface WSData {
  connectedAt: number;
}

export interface InjectRequest {
  session_id: string;
  message: string;
}

export interface CapRequest {
  session_id: string;
  tokens: number;
}

export interface KillRequest {
  session_id: string;
}

export type KillStatus = "killed" | "already_killed" | "not_found";

export interface KillResult {
  ok: true;
  session_id: string;
  status: KillStatus;
}
