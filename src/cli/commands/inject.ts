import { apiInject } from "../api.ts";
import type { InjectResult } from "../../types.ts";

type InjectCommandRender = {
  message: string;
  stream: "stdout" | "stderr";
  exitCode: 0 | 1;
};

type ValidationResult =
  | { ok: true }
  | { ok: false; message: string; exitCode: 1 };

const INJECTION_MESSAGE_LIMIT_BYTES = 64 * 1024;

export function validateInjectArgs(
  sessionId: string,
  message: string,
): ValidationResult {
  if (!sessionId.trim()) {
    return { ok: false, message: "session id cannot be empty", exitCode: 1 };
  }
  if (message.length === 0) {
    return {
      ok: false,
      message: "injection message cannot be empty",
      exitCode: 1,
    };
  }
  const bytes = new TextEncoder().encode(message).byteLength;
  if (bytes > INJECTION_MESSAGE_LIMIT_BYTES) {
    return {
      ok: false,
      message: `injection message exceeds ${INJECTION_MESSAGE_LIMIT_BYTES} bytes (UTF-8)`,
      exitCode: 1,
    };
  }
  return { ok: true };
}

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
    case "not_running":
      return `✗ Agent ${label} not running`;
  }
}

export function renderInjectResult(
  sessionId: string,
  result: InjectResult,
): InjectCommandRender {
  const message = formatInjectResult(sessionId, result);

  if (result.status === "not_found" || result.status === "not_running") {
    return { message, stream: "stderr", exitCode: 1 };
  }

  return { message, stream: "stdout", exitCode: 0 };
}

export async function cmdInject(sessionId: string, message: string) {
  const validation = validateInjectArgs(sessionId, message);
  if (!validation.ok) {
    console.error(`✗ ${validation.message}`);
    process.exit(validation.exitCode);
  }

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
