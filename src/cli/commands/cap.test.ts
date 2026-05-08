import { describe, expect, test } from "bun:test";
import {
  formatCapResult,
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
