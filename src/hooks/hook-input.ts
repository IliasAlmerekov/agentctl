import type {
  PostToolUseInput,
  PreToolUseInput,
  SubagentEventInput,
} from "../types.ts";

type Validator<T> = (value: unknown) => T | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(value, key);
}

export function parseHookInput<T>(
  raw: string,
  validate: Validator<T>,
): T | null {
  try {
    return validate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function validatePreToolUseInput(
  value: unknown,
): PreToolUseInput | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.session_id)) return null;
  if (!isNonEmptyString(value.tool_name)) return null;
  if (!isRecord(value.tool_input)) return null;

  return {
    session_id: value.session_id,
    tool_name: value.tool_name,
    tool_input: value.tool_input,
  };
}

export function validatePostToolUseInput(
  value: unknown,
): PostToolUseInput | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.session_id)) return null;
  if (!isNonEmptyString(value.tool_name)) return null;
  if (!isRecord(value.tool_input)) return null;
  if (!hasOwn(value, "tool_response")) return null;

  const tokensUsed = value.tokens_used;
  if (
    tokensUsed !== undefined &&
    (typeof tokensUsed !== "number" ||
      !Number.isFinite(tokensUsed) ||
      tokensUsed < 0)
  ) {
    return null;
  }

  return {
    session_id: value.session_id,
    tool_name: value.tool_name,
    tool_input: value.tool_input,
    tool_response: value.tool_response,
    tokens_used: tokensUsed,
  };
}

export function validateSubagentEventInput(
  value: unknown,
): SubagentEventInput | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.session_id)) return null;

  const parentSessionId = value.parent_session_id;
  if (parentSessionId !== undefined && typeof parentSessionId !== "string") {
    return null;
  }

  const description = value.description;
  if (description !== undefined && typeof description !== "string") {
    return null;
  }

  return {
    session_id: value.session_id,
    parent_session_id: parentSessionId,
    description,
  };
}
