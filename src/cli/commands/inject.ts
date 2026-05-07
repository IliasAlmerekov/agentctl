import { apiInject } from "../api.ts";

export function formatInjectQueued(sessionId: string): string {
  const label = sessionId.slice(0, 8);
  return `✓ Steering signal queued for agent ${label}`;
}

export async function cmdInject(sessionId: string, message: string) {
  try {
    await apiInject(sessionId, message);
    console.log(formatInjectQueued(sessionId));
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
