import { describe, expect, test, spyOn, mock } from "bun:test";
import { reconnectDelay, watchGuard, filterRecentAgents, agentLabel, tryStartDaemon } from "./watch.tsx";
import * as watchModule from "./watch.tsx";
import * as apiModule from "../api.ts";
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

describe("agentLabel", () => {
  test("uses description when set", () => {
    expect(agentLabel({ description: "red-tester", cwd: "/tmp", session_id: "abc" })).toBe("red-tester");
  });

  test("uses cwd basename when no description", () => {
    expect(agentLabel({ description: null, cwd: "/home/user/Projects/agentctl", session_id: "abc" }, "/home/user")).toBe("agentctl");
  });

  test("strips home prefix from cwd", () => {
    expect(agentLabel({ description: null, cwd: "/home/alice/work", session_id: "abc" }, "/home/alice")).toBe("work");
  });

  test("falls back to session id prefix when no description or cwd", () => {
    expect(agentLabel({ description: null, cwd: null, session_id: "b12e003c-1234" })).toBe("session:b12e003c");
  });

  test("handles root cwd gracefully", () => {
    const result = agentLabel({ description: null, cwd: "/", session_id: "abc" });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

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


describe("tryStartDaemon", () => {
  test("resolves within 3000ms when apiStatus never settles (AbortSignal.timeout guard)", async () => {
    const hangingApiStatus = mock(() => new Promise<never>(() => {}));
    spyOn(apiModule, "apiStatus").mockImplementation(hangingApiStatus);

    const start = Date.now();
    await tryStartDaemon();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(3000);
  }, 4000);

  test("calls console.warn containing 'agentctl-daemon' when Bun.spawn throws", async () => {
    spyOn(apiModule, "apiStatus").mockImplementation(() =>
      Promise.reject(new Error("connection refused"))
    );

    const origFile = Bun.file;
    Bun.file = ((_path: unknown) => ({ exists: () => Promise.resolve(true) })) as unknown as typeof Bun.file;

    const origSpawn = Bun.spawn;
    Bun.spawn = (() => {
      throw new Error("spawn failed");
    }) as unknown as typeof Bun.spawn;

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

    await tryStartDaemon();

    const calls = warnSpy.mock.calls;
    warnSpy.mockRestore();
    Bun.file = origFile;
    Bun.spawn = origSpawn;

    expect(calls.length).toBeGreaterThan(0);
    expect(String(calls[0][0])).toContain("agentctl-daemon");
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

type WatchMode = "browse" | "inject" | "cap" | "confirm_kill";

const watchTickMs = (watchModule as {
  watchTickMs?: ((mode: WatchMode, running: number, pending: number) => number | null)
    & ((arg: { mode: WatchMode; running: number; pending: number }) => number | null);
}).watchTickMs;

function callWatchTickMs(params: {
  mode: WatchMode;
  running: number;
  pending: number;
}): number | null | undefined {
  if (typeof watchTickMs !== "function") return undefined;
  if (watchTickMs.length <= 1) {
    return (watchTickMs as (arg: typeof params) => number | null)(params);
  }
  return watchTickMs(params.mode, params.running, params.pending);
}

describe("watchTickMs", () => {
  test("exports a helper for deciding watch refresh cadence", () => {
    expect(typeof watchTickMs).toBe("function");
  });

  test("returns null when idle (no running agents and no pending injections)", () => {
    expect(callWatchTickMs({ mode: "browse", running: 0, pending: 0 })).toBeNull();
  });

  test("returns null in inject mode even with running agents", () => {
    expect(callWatchTickMs({ mode: "inject", running: 2, pending: 0 })).toBeNull();
  });

  test("returns null in cap mode even with pending injections", () => {
    expect(callWatchTickMs({ mode: "cap", running: 0, pending: 1 })).toBeNull();
  });

  test("returns 5000ms when browsing with running agents", () => {
    expect(callWatchTickMs({ mode: "browse", running: 1, pending: 0 })).toBe(5000);
  });

  test("returns 5000ms when browsing with pending injections", () => {
    expect(callWatchTickMs({ mode: "browse", running: 0, pending: 3 })).toBe(5000);
  });
});
