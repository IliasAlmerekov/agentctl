import { readFileSync } from "fs";

export const AUTH_HEADER = "X-Agentctl-Token";

export function authTokenPath(home = process.env.HOME): string {
  if (!home) {
    throw new Error("HOME is not set; cannot locate agentctl auth token");
  }
  return `${home}/.agentctl/auth-token`;
}

export function readAuthToken(home = process.env.HOME): string {
  const token = readFileSync(authTokenPath(home), "utf8").trim();
  if (!token) {
    throw new Error("agentctl auth token is empty");
  }
  return token;
}

export function authHeaders(token: string): Record<string, string> {
  return { [AUTH_HEADER]: token };
}

export function hasAuthHeader(req: Request, token: string): boolean {
  return req.headers.get(AUTH_HEADER) === token;
}

export function hasAuthQueryToken(req: Request, token: string): boolean {
  return new URL(req.url).searchParams.get("token") === token;
}
