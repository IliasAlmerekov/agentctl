import { apiKill } from "../api.ts";
import type { KillResult } from "../../types.ts";

export function formatKillResult(sessionId: string, result: KillResult): string {
  const label = sessionId.slice(0, 8);

  switch (result.status) {
    case "killed":
      return `✓ Agent ${label} killed`;
    case "already_killed":
      return `✓ Agent ${label} already killed`;
    case "not_found":
      return `! Agent ${label} not found`;
  }
}

export async function cmdKill(sessionId: string) {
  try {
    const result = await apiKill(sessionId);
    console.log(formatKillResult(sessionId, result));
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
