import { apiCap } from "../api.ts";
import type { CapResult } from "../../types.ts";

type CapCommandRender = {
  message: string;
  stream: "stdout" | "stderr";
  exitCode: 0 | 1;
};

type ValidationResult =
  | { ok: true }
  | { ok: false; message: string; exitCode: 1 };

export function parseCapTokens(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || !Number.isSafeInteger(n)) return null;
  return n;
}

export function validateCapArgs(
  sessionId: string,
  tokens: number,
): ValidationResult {
  if (!sessionId.trim()) {
    return { ok: false, message: "session id cannot be empty", exitCode: 1 };
  }
  if (!Number.isInteger(tokens) || tokens <= 0) {
    return {
      ok: false,
      message: "--tokens must be a positive integer",
      exitCode: 1,
    };
  }
  return { ok: true };
}

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
    case "not_running":
      return `✗ Agent ${label} not running`;
  }
}

export function renderCapResult(
  sessionId: string,
  result: CapResult,
): CapCommandRender {
  const message = formatCapResult(sessionId, result);

  if (result.status === "not_found" || result.status === "not_running") {
    return { message, stream: "stderr", exitCode: 1 };
  }

  return { message, stream: "stdout", exitCode: 0 };
}

export async function cmdCap(sessionId: string, tokens: number) {
  const validation = validateCapArgs(sessionId, tokens);
  if (!validation.ok) {
    console.error(`✗ ${validation.message}`);
    process.exit(validation.exitCode);
  }

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
