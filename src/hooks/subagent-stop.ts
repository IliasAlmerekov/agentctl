import type { SubagentEventInput } from "../types.ts";

const DAEMON = "http://localhost:47823";
const TIMEOUT_MS = 130;

const input: SubagentEventInput = JSON.parse(await Bun.stdin.text());

try {
  await fetch(`${DAEMON}/hook/subagent-stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
} catch {
  // Daemon unavailable → fail open
}

process.exit(0);
