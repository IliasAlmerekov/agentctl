// Executed by Claude Code on every PreToolUse event.
// Must exit in < 150ms. Logic lives in the daemon.

import type { PreToolUseInput, DaemonDecision } from "../types.ts";
import { authHeaders, readAuthToken } from "../auth.ts";
import { DAEMON_HTTP_ORIGIN } from "../config.ts";

const TIMEOUT_MS = 130;

const input: PreToolUseInput = JSON.parse(await Bun.stdin.text());

let decision: DaemonDecision;

try {
  const res = await fetch(`${DAEMON_HTTP_ORIGIN}/hook/pre`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(readAuthToken()),
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  decision = (await res.json()) as DaemonDecision;
} catch {
  // Daemon unavailable → fail open, never block Claude
  process.exit(0);
}

if (decision.block) {
  process.stderr.write(decision.reason ?? "blocked by agentctl");
  process.exit(2);
}

if (decision.updatedInput) {
  console.log(JSON.stringify({ updatedInput: decision.updatedInput }));
}

process.exit(0);
