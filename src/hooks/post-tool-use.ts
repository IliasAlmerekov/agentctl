import type { PostToolUseInput } from "../types.ts";
import { sendHookRequest } from "./daemon-client.ts";

const input: PostToolUseInput = JSON.parse(await Bun.stdin.text());

await sendHookRequest("/hook/post", input);

process.exit(0);
