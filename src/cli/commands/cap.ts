import { apiCap } from "../api.ts";
import type { CapResult } from "../../types.ts";

type CapCommandRender = {
  message: string;
  stream: "stdout" | "stderr";
  exitCode: 0 | 1;
};

export function formatCapResult(
  sessionId: string,
  result: CapResult,
): string {
  const label = sessionId.slice(0, 8);

  switch (result.status) {
    case "set":
      return `✓ Token budget set to ${result.tokens.toLocaleString()} for agent ${label}`;
    case "not_found":
      return `✗ Agent ${label} not found`;
  }
}

export function renderCapResult(
  sessionId: string,
  result: CapResult,
): CapCommandRender {
  const message = formatCapResult(sessionId, result);

  if (result.status === "not_found") {
    return { message, stream: "stderr", exitCode: 1 };
  }

  return { message, stream: "stdout", exitCode: 0 };
}

export async function cmdCap(sessionId: string, tokens: number) {
  try {
    const result = await apiCap(sessionId, tokens);
    const rendered = renderCapResult(sessionId, result);
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
