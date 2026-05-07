import { apiInject } from "../api.ts";
import type { InjectResult } from "../../types.ts";

type InjectCommandRender = {
  message: string;
  stream: "stdout" | "stderr";
  exitCode: 0 | 1;
};

export function formatInjectResult(
  sessionId: string,
  result: InjectResult,
): string {
  const label = sessionId.slice(0, 8);

  switch (result.status) {
    case "queued":
      return `✓ Steering signal queued for agent ${label}`;
    case "not_found":
      return `✗ Agent ${label} not found`;
  }
}

export function renderInjectResult(
  sessionId: string,
  result: InjectResult,
): InjectCommandRender {
  const message = formatInjectResult(sessionId, result);

  if (result.status === "not_found") {
    return { message, stream: "stderr", exitCode: 1 };
  }

  return { message, stream: "stdout", exitCode: 0 };
}

export async function cmdInject(sessionId: string, message: string) {
  try {
    const result = await apiInject(sessionId, message);
    const rendered = renderInjectResult(sessionId, result);
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
