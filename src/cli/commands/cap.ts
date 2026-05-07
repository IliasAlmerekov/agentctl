import { apiCap } from "../api.ts";

export function formatCapSet(sessionId: string, tokens: number): string {
  const label = sessionId.slice(0, 8);
  return `✓ Token budget set to ${tokens.toLocaleString()} for agent ${label}`;
}

export async function cmdCap(sessionId: string, tokens: number) {
  try {
    await apiCap(sessionId, tokens);
    console.log(formatCapSet(sessionId, tokens));
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
