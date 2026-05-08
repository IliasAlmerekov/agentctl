import { describe, expect, test } from "bun:test";
import { reconnectDelay, watchGuard } from "./watch.tsx";

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
