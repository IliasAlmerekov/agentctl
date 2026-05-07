import { describe, expect, test } from "bun:test";
import { formatInjectResult, renderInjectResult } from "./inject.ts";

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
});
