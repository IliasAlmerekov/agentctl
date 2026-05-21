import { describe, expect, test } from "bun:test";
import {
  formatInjectResult,
  renderInjectResult,
  validateInjectArgs,
} from "./inject.ts";

describe("formatInjectResult", () => {
  test("formats queued steering signals with a short session label", () => {
    expect(formatInjectResult("injected-session", {
      ok: true,
      session_id: "injected-session",
      status: "queued",
    })).toBe(
      "✓ Steering signal queued for agent injected",
    );
  });

  test("formats missing sessions explicitly", () => {
    expect(formatInjectResult("missing-session", {
      ok: true,
      session_id: "missing-session",
      status: "not_found",
    })).toBe("✗ Agent missing- not found");
  });

  test("formats not_running sessions with same 8-char label pattern as not_found", () => {
    expect(formatInjectResult("killed-session", {
      ok: true,
      session_id: "killed-session",
      status: "not_running",
    })).toBe("✗ Agent killed-s not running");
  });
});

describe("renderInjectResult", () => {
  test("renders missing sessions as a CLI error", () => {
    expect(renderInjectResult("missing-session", {
      ok: true,
      session_id: "missing-session",
      status: "not_found",
    })).toEqual({
      message: "✗ Agent missing- not found",
      stream: "stderr",
      exitCode: 1,
    });
  });

  test("renders not_running sessions as a CLI error", () => {
    expect(renderInjectResult("killed-session", {
      ok: true,
      session_id: "killed-session",
      status: "not_running",
    })).toEqual({
      message: "✗ Agent killed-s not running",
      stream: "stderr",
      exitCode: 1,
    });
  });
});

describe("validateInjectArgs", () => {
  test("accepts non-empty session id and message", () => {
    expect(validateInjectArgs("session-x", "stop now")).toEqual({ ok: true });
  });

  test("rejects empty session id", () => {
    expect(validateInjectArgs("", "stop")).toEqual({
      ok: false,
      message: "session id cannot be empty",
      exitCode: 1,
    });
  });

  test("rejects whitespace-only session id", () => {
    expect(validateInjectArgs("   ", "stop")).toEqual({
      ok: false,
      message: "session id cannot be empty",
      exitCode: 1,
    });
  });

  test("rejects empty message", () => {
    expect(validateInjectArgs("session-x", "")).toEqual({
      ok: false,
      message: "injection message cannot be empty",
      exitCode: 1,
    });
  });

  test("rejects message larger than 64 KB UTF-8", () => {
    const big = "a".repeat(65_537);
    const result = validateInjectArgs("session-x", big);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/exceeds 65536 bytes/);
      expect(result.exitCode).toBe(1);
    }
  });
});
