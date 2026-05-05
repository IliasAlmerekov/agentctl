import type { PostToolUseInput } from "../types.ts";
import { authHeaders, readAuthToken } from "../auth.ts";

const DAEMON = "http://localhost:47823";
const TIMEOUT_MS = 130;

const input: PostToolUseInput = JSON.parse(await Bun.stdin.text());

try {
  await fetch(`${DAEMON}/hook/post`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(readAuthToken()),
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
} catch {
  // Daemon unavailable → fail open
}

process.exit(0);
