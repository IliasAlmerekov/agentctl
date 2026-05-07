import type { PostToolUseInput } from "../types.ts";
import { sendHookRequest } from "./daemon-client.ts";
import { parseHookInput, validatePostToolUseInput } from "./hook-input.ts";

const input: PostToolUseInput | null = parseHookInput(
  await Bun.stdin.text(),
  validatePostToolUseInput,
);

if (!input) {
  process.exit(0);
}

await sendHookRequest("/hook/post", input);

process.exit(0);
