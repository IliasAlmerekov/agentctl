import { describe, expect, test } from "bun:test";
import { formatKillResult } from "./kill.ts";

describe("formatKillResult", () => {
  test("formats a normal kill result", () => {
    expect(
      formatKillResult("running-session", {
        ok: true,
        session_id: "running-session",
        status: "killed",
      }),
    ).toBe("✓ Agent running- killed");
  });

  test("formats repeated kill idempotently", () => {
    expect(
      formatKillResult("killed-session", {
        ok: true,
        session_id: "killed-session",
        status: "already_killed",
      }),
    ).toBe("✓ Agent killed-s already killed");
  });

  test("formats a missing session explicitly", () => {
    expect(
      formatKillResult("missing-session", {
        ok: true,
        session_id: "missing-session",
        status: "not_found",
      }),
    ).toBe("! Agent missing- not found");
  });
});
