import { apiCap } from "../api.ts";

export async function cmdCap(sessionId: string, tokens: number) {
  try {
    await apiCap(sessionId, tokens);
    console.log(
      `✓ Token budget set to ${tokens.toLocaleString()} for agent ${sessionId.slice(0, 8)}`,
    );
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
