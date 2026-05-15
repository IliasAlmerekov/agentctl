import { describe, expect, test } from "bun:test";
import { formatKillResult, renderKillResult } from "./kill.ts";

describe("formatKillResult", () => {
  test("formats a normal kill result", () => {
    expect(
      formatKillResult("running-session", {
        ok: true,
        session_id: "running-session",
        status: "killed",
      }),
    ).toBe("✓ Agent running- will stop at next tool call");
  });

  test("formats repeated kill idempotently", () => {
    expect(
      formatKillResult("killed-session", {
        ok: true,
        session_id: "killed-session",
        status: "already_killed",
      }),
    ).toBe("✓ Agent killed-s already scheduled to stop");
  });

  test("formats a missing session explicitly", () => {
    expect(
      formatKillResult("missing-session", {
        ok: true,
        session_id: "missing-session",
        status: "not_found",
      }),
    ).toBe("✗ Agent missing- not found");
  });
});

describe("renderKillResult", () => {
  test("renders successful kills as stdout with exit code 0", () => {
    expect(
      renderKillResult("running-session", {
        ok: true,
        session_id: "running-session",
        status: "killed",
      }),
    ).toEqual({
      message: "✓ Agent running- will stop at next tool call",
      stream: "stdout",
      exitCode: 0,
    });
  });

  test("renders repeated kills as stdout with exit code 0", () => {
    expect(
      renderKillResult("killed-session", {
        ok: true,
        session_id: "killed-session",
        status: "already_killed",
      }),
    ).toEqual({
      message: "✓ Agent killed-s already scheduled to stop",
      stream: "stdout",
      exitCode: 0,
    });
  });

  test("renders missing sessions as a CLI error", () => {
    expect(
      renderKillResult("missing-session", {
        ok: true,
        session_id: "missing-session",
        status: "not_found",
      }),
    ).toEqual({
      message: "✗ Agent missing- not found",
      stream: "stderr",
      exitCode: 1,
    });
  });
});
