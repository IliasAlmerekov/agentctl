import { apiKill } from "../api.ts";

export async function cmdKill(sessionId: string) {
  try {
    await apiKill(sessionId);
    console.log(`✓ Agent ${sessionId.slice(0, 8)} killed`);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
