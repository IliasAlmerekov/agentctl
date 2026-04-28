import { apiInject } from "../api.ts";

export async function cmdInject(sessionId: string, message: string) {
  try {
    await apiInject(sessionId, message);
    console.log(`✓ Steering signal queued for agent ${sessionId.slice(0, 8)}`);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
