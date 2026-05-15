import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AUTH_HEADER } from "../src/auth.ts";
import { DAEMON_HOST } from "../src/config.ts";

export const HOOK_LATENCY_SCENARIOS = [
  "normal",
  "slow-daemon",
  "daemon-unavailable",
] as const;

export type HookLatencyScenario = (typeof HOOK_LATENCY_SCENARIOS)[number];

type HookLatencySpec = {
  name: string;
  binaryPath: string;
  input: Record<string, unknown>;
};

type HookLatencySample = {
  exitCode: number;
  ms: number;
  stderr: string;
  stdout: string;
};

export type HookLatencySummary = {
  avg_ms: number;
  max_ms: number;
  min_ms: number;
  p95_ms: number;
};

export type HookLatencyRow = {
  hook: string;
  scenario: HookLatencyScenario;
  summary: HookLatencySummary;
};

export type CumulativeOverheadEstimate = {
  calls: number;
  scenario: HookLatencyScenario;
  worst_hook_p95_ms: number;
  estimated_total_p95_ms: number;
};

const TOKEN = "agentctl-hook-latency-token";
const DEFAULT_RUNS = 10;
const DEFAULT_CUMULATIVE_CALLS = 50;

export const HOOK_LATENCY_BUDGETS_MS = {
  normal: 250,
  "slow-daemon": 150,
  "daemon-unavailable": 75,
} as const satisfies Record<HookLatencyScenario, number>;

export const HOOK_LATENCY_SPECS: HookLatencySpec[] = [
  {
    name: "pre-tool-use",
    binaryPath: "dist/hooks/pre-tool-use",
    input: {
      session_id: "latency-session",
      tool_name: "Bash",
      tool_input: { command: "rtk true" },
    },
  },
  {
    name: "post-tool-use",
    binaryPath: "dist/hooks/post-tool-use",
    input: {
      session_id: "latency-session",
      tool_name: "Bash",
      tool_input: { command: "rtk true" },
      tool_response: { exit_code: 0 },
      tokens_used: 1,
    },
  },
  {
    name: "subagent-start",
    binaryPath: "dist/hooks/subagent-start",
    input: {
      session_id: "latency-child",
      parent_session_id: "latency-parent",
      description: "Latency probe",
    },
  },
  {
    name: "subagent-stop",
    binaryPath: "dist/hooks/subagent-stop",
    input: {
      session_id: "latency-child",
      parent_session_id: "latency-parent",
      description: "Latency probe",
    },
  },
];

export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) {
    throw new Error("Cannot calculate percentile for an empty sample set");
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function summarize(samples: HookLatencySample[]): HookLatencySummary {
  const values = samples.map((sample) => sample.ms);
  const sum = values.reduce((total, value) => total + value, 0);

  return {
    avg_ms: roundMs(sum / values.length),
    max_ms: roundMs(Math.max(...values)),
    min_ms: roundMs(Math.min(...values)),
    p95_ms: roundMs(percentile(values, 95)),
  };
}

function buildHooks(): void {
  const result = Bun.spawnSync({
    cmd: [process.execPath, "run", "build:hooks"],
    stdout: "inherit",
    stderr: "inherit",
  });

  if (!result.success) {
    throw new Error(`Failed to build compiled hooks (exit ${result.exitCode})`);
  }
}

function createTempHome(): string {
  const home = mkdtempSync(join(tmpdir(), "agentctl-hook-latency-"));
  const agentctlHome = join(home, ".agentctl");
  mkdirSync(agentctlHome, { recursive: true });
  writeFileSync(join(agentctlHome, "auth-token"), `${TOKEN}\n`, { mode: 0o600 });
  return home;
}

function randomLatencyPort(): number {
  return 20_000 + Math.floor(Math.random() * 30_000);
}

function startStubDaemon(
  options: { responseDelayMs?: number } = {},
): { origin: string; stop: () => void } {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = randomLatencyPort();
    try {
      const server = Bun.serve({
        hostname: DAEMON_HOST,
        port,
        async fetch(req) {
          if (req.headers.get(AUTH_HEADER) !== TOKEN) {
            return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
          }

          if (options.responseDelayMs) {
            await Bun.sleep(options.responseDelayMs);
          }

          const { pathname } = new URL(req.url);
          if (pathname === "/hook/pre") {
            return Response.json({ block: false });
          }

          return Response.json({ ok: true });
        },
      });

      return {
        origin: `http://${DAEMON_HOST}:${port}`,
        stop: () => server.stop(true),
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to start latency stub daemon");
}

function runHook(
  spec: HookLatencySpec,
  home: string,
  daemonOrigin?: string,
): HookLatencySample {
  const input = new TextEncoder().encode(JSON.stringify(spec.input));
  const started = performance.now();
  const result = Bun.spawnSync({
    cmd: [spec.binaryPath],
    env: {
      ...process.env,
      HOME: home,
      ...(daemonOrigin ? { AGENTCTL_DAEMON_HTTP_ORIGIN: daemonOrigin } : {}),
    },
    stdin: input,
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: result.exitCode,
    ms: performance.now() - started,
    stderr: new TextDecoder().decode(result.stderr),
    stdout: new TextDecoder().decode(result.stdout),
  };
}

function measureScenario(
  scenario: HookLatencyScenario,
  home: string,
  runs: number,
  daemonOrigin?: string,
): HookLatencyRow[] {
  const rows: HookLatencyRow[] = [];

  for (const spec of HOOK_LATENCY_SPECS) {
    const samples = Array.from({ length: runs }, () =>
      runHook(spec, home, daemonOrigin),
    );
    const failed = samples.find((sample) => sample.exitCode !== 0);
    if (failed) {
      throw new Error(
        `${spec.name} exited ${failed.exitCode} during ${scenario}: ${failed.stderr}`,
      );
    }

    rows.push({ hook: spec.name, scenario, summary: summarize(samples) });
  }

  return rows;
}

export function assertLatencyBudgets(rows: HookLatencyRow[]): void {
  for (const row of rows) {
    const budget = HOOK_LATENCY_BUDGETS_MS[row.scenario];
    if (row.summary.p95_ms > budget) {
      throw new Error(
        `${row.hook} ${row.scenario} p95 ${row.summary.p95_ms}ms exceeds budget ${budget}ms`,
      );
    }
  }
}

export function estimateCumulativeOverhead(
  rows: HookLatencyRow[],
  calls: number,
  scenario: HookLatencyScenario = "normal",
): CumulativeOverheadEstimate {
  if (!Number.isInteger(calls) || calls < 1) {
    throw new Error("calls must be a positive integer");
  }

  const matching = rows.filter((row) => row.scenario === scenario);
  if (matching.length === 0) {
    throw new Error(`No latency rows for ${scenario}`);
  }

  const worstHookP95 = Math.max(...matching.map((row) => row.summary.p95_ms));
  return {
    calls,
    scenario,
    worst_hook_p95_ms: worstHookP95,
    estimated_total_p95_ms: roundMs(worstHookP95 * calls),
  };
}

function printRows(rows: HookLatencyRow[]): void {
  console.log("hook,scenario,min_ms,avg_ms,p95_ms,max_ms");
  for (const row of rows) {
    const { min_ms, avg_ms, p95_ms, max_ms } = row.summary;
    console.log(
      `${row.hook},${row.scenario},${min_ms},${avg_ms},${p95_ms},${max_ms}`,
    );
  }
}

function printCumulativeEstimate(estimate: CumulativeOverheadEstimate): void {
  console.log(
    `cumulative_p95_estimate,scenario=${estimate.scenario},calls=${estimate.calls},` +
      `worst_hook_p95_ms=${estimate.worst_hook_p95_ms},` +
      `estimated_total_p95_ms=${estimate.estimated_total_p95_ms}`,
  );
}

async function main(): Promise<void> {
  const runs = Number(process.env.AGENTCTL_HOOK_LATENCY_RUNS ?? DEFAULT_RUNS);
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error("AGENTCTL_HOOK_LATENCY_RUNS must be a positive integer");
  }
  const cumulativeCalls = Number(
    process.env.AGENTCTL_HOOK_LATENCY_CUMULATIVE_CALLS ?? DEFAULT_CUMULATIVE_CALLS,
  );
  if (!Number.isInteger(cumulativeCalls) || cumulativeCalls < 1) {
    throw new Error("AGENTCTL_HOOK_LATENCY_CUMULATIVE_CALLS must be a positive integer");
  }

  buildHooks();
  const home = createTempHome();
  const rows: HookLatencyRow[] = [];

  try {
    const stubDaemon = startStubDaemon();
    try {
      rows.push(...measureScenario("normal", home, runs, stubDaemon.origin));
    } finally {
      stubDaemon.stop();
    }

    await Bun.sleep(50);
    const slowDaemon = startStubDaemon({ responseDelayMs: 100 });
    try {
      rows.push(...measureScenario("slow-daemon", home, runs, slowDaemon.origin));
    } finally {
      slowDaemon.stop();
    }

    await Bun.sleep(50);
    rows.push(...measureScenario("daemon-unavailable", home, runs));
    printRows(rows);
    printCumulativeEstimate(estimateCumulativeOverhead(rows, cumulativeCalls));
    assertLatencyBudgets(rows);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
