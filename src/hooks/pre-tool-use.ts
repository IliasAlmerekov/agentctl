// Executed by Claude Code on every PreToolUse event.
// Must exit in < 150ms. Logic lives in the daemon.

import type { PreToolUseInput, DaemonDecision } from "../types.ts";
import { sendHookRequest } from "./daemon-client.ts";
import { parseHookInput, validatePreToolUseInput } from "./hook-input.ts";

const input: PreToolUseInput | null = parseHookInput(
  await Bun.stdin.text(),
  validatePreToolUseInput,
);

if (!input) {
  process.exit(0);
}

const decision = await sendHookRequest<DaemonDecision>("/hook/pre", input);

if (!decision) {
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
