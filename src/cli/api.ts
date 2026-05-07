import { authHeaders, readAuthToken } from "../auth.ts";
import { DAEMON_HTTP_ORIGIN, DAEMON_WS_ORIGIN } from "../config.ts";

async function post<T>(path: string, body: unknown): Promise<T> {
  const token = readAuthToken();
  const res = await fetch(`${DAEMON_HTTP_ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`agentctl daemon error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${DAEMON_HTTP_ORIGIN}${path}`, {
    headers: authHeaders(readAuthToken()),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`agentctl daemon error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function apiInject(sessionId: string, message: string) {
  return post<import("../types.ts").InjectResult>("/inject", {
    session_id: sessionId,
    message,
  });
}

export async function apiCap(sessionId: string, tokens: number) {
  return post<import("../types.ts").CapResult>("/cap", {
    session_id: sessionId,
    tokens,
  });
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

export { authHeaders };

export function daemonWsUrlWithToken(token: string): string {
  return `${DAEMON_WS_ORIGIN}?${new URLSearchParams({ token }).toString()}`;
}

export function daemonWsUrl(): string {
  return daemonWsUrlWithToken(readAuthToken());
}
