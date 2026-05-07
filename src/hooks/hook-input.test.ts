import { describe, expect, test } from "bun:test";
import { join } from "path";
import {
  parseHookInput,
  validatePostToolUseInput,
  validatePreToolUseInput,
  validateSubagentEventInput,
} from "./hook-input.ts";

describe("hook input validation", () => {
  test("accepts valid PreToolUse input", () => {
    expect(
      validatePreToolUseInput({
        session_id: "session-a",
        tool_name: "Bash",
        tool_input: { command: "rtk test" },
      }),
    ).toEqual({
      session_id: "session-a",
      tool_name: "Bash",
      tool_input: { command: "rtk test" },
    });
  });

  test("rejects malformed PreToolUse input before daemon delivery", () => {
    expect(
      validatePreToolUseInput({
        session_id: "session-a",
        tool_name: "Bash",
        tool_input: ["not", "an", "object"],
      }),
    ).toBeNull();
  });

  test("accepts valid PostToolUse input with optional token count", () => {
    expect(
      validatePostToolUseInput({
        session_id: "session-a",
        tool_name: "Bash",
        tool_input: { command: "rtk test" },
        tool_response: { exit_code: 0 },
        tokens_used: 12,
      }),
    ).toEqual({
      session_id: "session-a",
      tool_name: "Bash",
      tool_input: { command: "rtk test" },
      tool_response: { exit_code: 0 },
      tokens_used: 12,
    });
  });

  test("rejects malformed PostToolUse input before daemon delivery", () => {
    expect(
      validatePostToolUseInput({
        session_id: "session-a",
        tool_name: "Bash",
        tool_input: { command: "rtk test" },
        tokens_used: "12",
      }),
    ).toBeNull();
  });

  test("accepts valid Subagent event input", () => {
    expect(
      validateSubagentEventInput({
        session_id: "child-session",
        parent_session_id: "parent-session",
        description: "Audit docs",
      }),
    ).toEqual({
      session_id: "child-session",
      parent_session_id: "parent-session",
      description: "Audit docs",
    });
  });

  test("rejects malformed Subagent event input before daemon delivery", () => {
    expect(validateSubagentEventInput({ parent_session_id: "parent" })).toBeNull();
  });

  test("parses valid JSON through the requested validator", () => {
    expect(
      parseHookInput(
        JSON.stringify({
          session_id: "session-a",
          tool_name: "Bash",
          tool_input: { command: "rtk test" },
        }),
        validatePreToolUseInput,
      ),
    ).toEqual({
      session_id: "session-a",
      tool_name: "Bash",
      tool_input: { command: "rtk test" },
    });
  });

  test("rejects invalid JSON before validation", () => {
    expect(parseHookInput("{bad json", validatePreToolUseInput)).toBeNull();
  });
});

describe("hook entrypoint malformed input handling", () => {
  for (const script of [
    "pre-tool-use.ts",
    "post-tool-use.ts",
    "subagent-start.ts",
    "subagent-stop.ts",
  ]) {
    test(`${script} exits open on invalid JSON`, () => {
      const result = Bun.spawnSync({
        cmd: [process.execPath, join("src", "hooks", script)],
        stdin: new TextEncoder().encode("{bad json"),
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(result.exitCode).toBe(0);
      expect(new TextDecoder().decode(result.stdout)).toBe("");
      expect(new TextDecoder().decode(result.stderr)).toBe("");
    });
  }
});
