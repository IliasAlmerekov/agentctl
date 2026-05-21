import { describe, expect, test } from "bun:test";
import {
  formatCapResult,
  parseCapTokens,
  renderCapResult,
  validateCapArgs,
} from "./cap.ts";

describe("formatCapResult", () => {
  test("formats token budget confirmations with a short session label", () => {
    expect(formatCapResult("budget-session", {
      ok: true,
      session_id: "budget-session",
      status: "set",
      tokens: 50,
    })).toBe(
      "✓ Token budget set to 50 for agent budget-s",
    );
  });

  test("formats missing sessions explicitly", () => {
    expect(formatCapResult("missing-session", {
      ok: true,
      session_id: "missing-session",
      status: "not_found",
    })).toBe("✗ Agent missing- not found");
  });

  test("formats not_running sessions with same 8-char label pattern as not_found", () => {
    expect(formatCapResult("killed-session", {
      ok: true,
      session_id: "killed-session",
      status: "not_running",
    })).toBe("✗ Agent killed-s not running");
  });
});

describe("renderCapResult", () => {
  test("renders missing sessions as a CLI error", () => {
    expect(renderCapResult("missing-session", {
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
    expect(renderCapResult("killed-session", {
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

describe("validateCapArgs", () => {
  test("accepts positive integer tokens", () => {
    expect(validateCapArgs("session-x", 1000)).toEqual({ ok: true });
  });

  test("rejects empty session id", () => {
    expect(validateCapArgs("", 100)).toEqual({
      ok: false,
      message: "session id cannot be empty",
      exitCode: 1,
    });
  });

  test("rejects NaN tokens", () => {
    expect(validateCapArgs("session-x", NaN)).toEqual({
      ok: false,
      message: "--tokens must be a positive integer",
      exitCode: 1,
    });
  });

  test("rejects zero tokens", () => {
    expect(validateCapArgs("session-x", 0)).toEqual({
      ok: false,
      message: "--tokens must be a positive integer",
      exitCode: 1,
    });
  });

  test("rejects negative tokens", () => {
    expect(validateCapArgs("session-x", -100)).toEqual({
      ok: false,
      message: "--tokens must be a positive integer",
      exitCode: 1,
    });
  });

  test("rejects fractional tokens", () => {
    expect(validateCapArgs("session-x", 100.5)).toEqual({
      ok: false,
      message: "--tokens must be a positive integer",
      exitCode: 1,
    });
  });
});

describe("parseCapTokens", () => {
  test("accepts plain positive integer strings", () => {
    expect(parseCapTokens("1000")).toBe(1000);
    expect(parseCapTokens("1")).toBe(1);
  });

  test("rejects fractional input that parseInt would truncate", () => {
    expect(parseCapTokens("100.5")).toBeNull();
  });

  test("rejects trailing garbage that parseInt would discard", () => {
    expect(parseCapTokens("100abc")).toBeNull();
  });

  test("rejects scientific notation that parseInt would mis-handle", () => {
    expect(parseCapTokens("1e3")).toBeNull();
  });

  test("rejects negative input", () => {
    expect(parseCapTokens("-100")).toBeNull();
  });

  test("rejects zero", () => {
    expect(parseCapTokens("0")).toBeNull();
  });

  test("rejects empty string", () => {
    expect(parseCapTokens("")).toBeNull();
  });

  test("rejects whitespace", () => {
    expect(parseCapTokens(" 100 ")).toBeNull();
  });

  test("rejects hex-style input", () => {
    expect(parseCapTokens("0x1f")).toBeNull();
  });
});
