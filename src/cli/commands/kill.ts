import { apiKill } from "../api.ts";
import type { KillResult } from "../../types.ts";

type KillCommandRender = {
  message: string;
  stream: "stdout" | "stderr";
  exitCode: 0 | 1;
};

export function formatKillResult(sessionId: string, result: KillResult): string {
  const label = sessionId.slice(0, 8);

  switch (result.status) {
    case "killed":
      return `✓ Agent ${label} killed`;
    case "already_killed":
      return `✓ Agent ${label} already killed`;
    case "not_found":
      return `✗ Agent ${label} not found`;
  }
}

export function renderKillResult(
  sessionId: string,
  result: KillResult,
): KillCommandRender {
  const message = formatKillResult(sessionId, result);

  if (result.status === "not_found") {
    return { message, stream: "stderr", exitCode: 1 };
  }

  return { message, stream: "stdout", exitCode: 0 };
}

export async function cmdKill(sessionId: string) {
  try {
    const result = await apiKill(sessionId);
    const rendered = renderKillResult(sessionId, result);
    if (rendered.stream === "stderr") {
      console.error(rendered.message);
    } else {
      console.log(rendered.message);
    }
    if (rendered.exitCode !== 0) process.exit(rendered.exitCode);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
