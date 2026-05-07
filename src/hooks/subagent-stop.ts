import type { SubagentEventInput } from "../types.ts";
import { sendHookRequest } from "./daemon-client.ts";
import { parseHookInput, validateSubagentEventInput } from "./hook-input.ts";

const input: SubagentEventInput | null = parseHookInput(
  await Bun.stdin.text(),
  validateSubagentEventInput,
);

if (!input) {
  process.exit(0);
}

await sendHookRequest("/hook/subagent-stop", input);

process.exit(0);
