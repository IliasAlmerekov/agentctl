import { describe, expect, test } from "bun:test";
import { formatCapResult, renderCapResult } from "./cap.ts";

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
