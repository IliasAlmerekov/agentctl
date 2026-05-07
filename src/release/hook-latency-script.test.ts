import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import {
  HOOK_LATENCY_BUDGETS_MS,
  HOOK_LATENCY_SCENARIOS,
  HOOK_LATENCY_SPECS,
  assertLatencyBudgets,
  percentile,
} from "../../scripts/measure-hook-latency.ts";

describe("compiled hook latency measurement script", () => {
  test("is exposed through a package script", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.["measure:hooks"]).toBe(
      "bun run scripts/measure-hook-latency.ts",
    );
  });

  test("covers every compiled hook and required latency scenario", () => {
    expect(HOOK_LATENCY_SCENARIOS).toEqual([
      "normal",
      "daemon-unavailable",
    ]);
    expect(HOOK_LATENCY_BUDGETS_MS).toEqual({
      normal: 250,
      "daemon-unavailable": 75,
    });
    expect(HOOK_LATENCY_SPECS.map((hook) => hook.name)).toEqual([
      "pre-tool-use",
      "post-tool-use",
      "subagent-start",
      "subagent-stop",
    ]);
    expect(HOOK_LATENCY_SPECS.map((hook) => hook.binaryPath)).toEqual([
      "dist/hooks/pre-tool-use",
      "dist/hooks/post-tool-use",
      "dist/hooks/subagent-start",
      "dist/hooks/subagent-stop",
    ]);
  });

  test("computes percentile latency with nearest-rank semantics", () => {
    expect(percentile([4, 1, 2, 3, 100], 95)).toBe(100);
    expect(percentile([4, 1, 2, 3, 100], 50)).toBe(3);
  });

  test("fails when measured p95 exceeds the launch latency budget", () => {
    expect(() =>
      assertLatencyBudgets([
        {
          hook: "pre-tool-use",
          scenario: "normal",
          summary: { min_ms: 1, avg_ms: 2, p95_ms: 251, max_ms: 251 },
        },
      ]),
    ).toThrow("pre-tool-use normal p95 251ms exceeds budget 250ms");
  });
});
