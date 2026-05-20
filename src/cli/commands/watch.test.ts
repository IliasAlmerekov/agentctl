import { describe, expect, test } from "bun:test";
import { reconnectDelay, watchGuard, filterRecentAgents } from "./watch.tsx";
import type { Agent } from "../../types.ts";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    session_id: "test",
    parent_id: null,
    description: null,
    status: "done",
    depth: 0,
    tokens_used: 0,
    token_budget: null,
    started_at: Date.now(),
    ended_at: Date.now(),
    current_tool: null,
    cwd: null,
    ...overrides,
  };
}

describe("watchGuard", () => {
  test("allows TTY stdin and stdout", () => {
    expect(watchGuard({ stdin: true, stdout: true })).toEqual({ ok: true });
  });

  test("rejects non-TTY stdout", () => {
    expect(watchGuard({ stdin: true, stdout: false })).toEqual({
      ok: false,
      message: "agentctl watch requires a TTY",
      exitCode: 1,
    });
  });

  test("rejects non-TTY stdin (Ink raw-mode requirement)", () => {
    expect(watchGuard({ stdin: false, stdout: true })).toEqual({
      ok: false,
      message: "agentctl watch requires a TTY",
      exitCode: 1,
    });
  });

  test("rejects undefined TTY flags (piped or closed streams)", () => {
    expect(watchGuard({ stdin: undefined, stdout: undefined })).toEqual({
      ok: false,
      message: "agentctl watch requires a TTY",
      exitCode: 1,
    });
  });
});

describe("filterRecentAgents", () => {
  const now = Date.now();
  const FOUR_HOURS = 4 * 60 * 60 * 1_000;

  test("always shows running agents regardless of age", () => {
    const old = makeAgent({ status: "running", started_at: 0, ended_at: null });
    expect(filterRecentAgents([old], now)).toHaveLength(1);
  });

  test("shows finished agent ended within 4 hours", () => {
    const recent = makeAgent({ ended_at: now - 60_000 });
    expect(filterRecentAgents([recent], now)).toHaveLength(1);
  });

  test("hides finished agent ended more than 4 hours ago", () => {
    const old = makeAgent({ ended_at: now - FOUR_HOURS - 1 });
    expect(filterRecentAgents([old], now)).toHaveLength(0);
  });

  test("hides stale agent with old started_at and no ended_at", () => {
    const old = makeAgent({ status: "stale", started_at: now - FOUR_HOURS - 1, ended_at: null });
    expect(filterRecentAgents([old], now)).toHaveLength(0);
  });

  test("mixes running and recent finished correctly", () => {
    const running = makeAgent({ session_id: "r", status: "running", ended_at: null });
    const recent = makeAgent({ session_id: "f", ended_at: now - 1_000 });
    const old = makeAgent({ session_id: "o", ended_at: now - FOUR_HOURS - 1 });
    expect(filterRecentAgents([running, recent, old], now)).toHaveLength(2);
  });
});

describe("reconnectDelay", () => {
  test("returns base delay on first attempt", () => {
    expect(reconnectDelay(0)).toBe(1000);
  });

  test("doubles delay on each subsequent attempt", () => {
    expect(reconnectDelay(1)).toBe(2000);
    expect(reconnectDelay(2)).toBe(4000);
    expect(reconnectDelay(3)).toBe(8000);
  });

  test("caps at maxMs", () => {
    expect(reconnectDelay(4)).toBe(10_000);
    expect(reconnectDelay(10)).toBe(10_000);
  });

  test("accepts custom base and max", () => {
    expect(reconnectDelay(0, 500, 3000)).toBe(500);
    expect(reconnectDelay(3, 500, 3000)).toBe(3000);
  });
});
