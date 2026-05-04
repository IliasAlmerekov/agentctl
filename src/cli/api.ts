const DAEMON = "http://localhost:47823";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${DAEMON}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`agentctl daemon error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${DAEMON}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`agentctl daemon error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function apiInject(sessionId: string, message: string) {
  return post<{ ok: boolean }>("/inject", { session_id: sessionId, message });
}

export async function apiCap(sessionId: string, tokens: number) {
  return post<{ ok: boolean }>("/cap", { session_id: sessionId, tokens });
}

export async function apiKill(sessionId: string) {
  return post<import("../types.ts").KillResult>("/kill", {
    session_id: sessionId,
  });
}

export async function apiAgents() {
  return get<import("../types.ts").Agent[]>("/agents");
}

export async function apiStatus() {
  return get<{ ok: boolean; running: number; total: number }>("/status");
}

export function daemonWsUrl(): string {
  return "ws://localhost:47823";
}
