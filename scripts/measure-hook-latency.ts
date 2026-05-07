import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AUTH_HEADER } from "../src/auth.ts";
import { DAEMON_HOST, DAEMON_PORT } from "../src/config.ts";

export const HOOK_LATENCY_SCENARIOS = [
  "normal",
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

const TOKEN = "agentctl-hook-latency-token";
const DEFAULT_RUNS = 10;

export const HOOK_LATENCY_BUDGETS_MS = {
  normal: 250,
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

function startStubDaemon(): { stop: () => void } {
  const server = Bun.serve({
    hostname: DAEMON_HOST,
    port: DAEMON_PORT,
    fetch(req) {
      if (req.headers.get(AUTH_HEADER) !== TOKEN) {
        return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }

      const { pathname } = new URL(req.url);
      if (pathname === "/hook/pre") {
        return Response.json({ block: false });
      }

      return Response.json({ ok: true });
    },
  });

  return {
    stop: () => server.stop(true),
  };
}

function runHook(spec: HookLatencySpec, home: string): HookLatencySample {
  const input = new TextEncoder().encode(JSON.stringify(spec.input));
  const started = performance.now();
  const result = Bun.spawnSync({
    cmd: [spec.binaryPath],
    env: { ...process.env, HOME: home },
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
): HookLatencyRow[] {
  const rows: HookLatencyRow[] = [];

  for (const spec of HOOK_LATENCY_SPECS) {
    const samples = Array.from({ length: runs }, () => runHook(spec, home));
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

function printRows(rows: HookLatencyRow[]): void {
  console.log("hook,scenario,min_ms,avg_ms,p95_ms,max_ms");
  for (const row of rows) {
    const { min_ms, avg_ms, p95_ms, max_ms } = row.summary;
    console.log(
      `${row.hook},${row.scenario},${min_ms},${avg_ms},${p95_ms},${max_ms}`,
    );
  }
}

async function main(): Promise<void> {
  const runs = Number(process.env.AGENTCTL_HOOK_LATENCY_RUNS ?? DEFAULT_RUNS);
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error("AGENTCTL_HOOK_LATENCY_RUNS must be a positive integer");
  }

  buildHooks();
  const home = createTempHome();
  const rows: HookLatencyRow[] = [];

  try {
    const stubDaemon = startStubDaemon();
    try {
      rows.push(...measureScenario("normal", home, runs));
    } finally {
      stubDaemon.stop();
    }

    await Bun.sleep(50);
    rows.push(...measureScenario("daemon-unavailable", home, runs));
    printRows(rows);
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
