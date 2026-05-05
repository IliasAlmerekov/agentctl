import type { SubagentEventInput } from "../types.ts";
import { sendHookRequest } from "./daemon-client.ts";

const input: SubagentEventInput = JSON.parse(await Bun.stdin.text());

await sendHookRequest("/hook/subagent-stop", input);

process.exit(0);
