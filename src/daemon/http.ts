import type { Database } from "bun:sqlite";
import type {
  AgentEvent,
  CapRequest,
  InjectRequest,
  KillRequest,
  WSData,
} from "../types.ts";
import { getAgent, setBudget } from "./budget.ts";
import { getAgents } from "./db.ts";
import { createInjection } from "./injections.ts";
import { killAgent } from "./kill.ts";
import { handlePostTool } from "./handlers/post-tool.ts";
import { handlePreTool } from "./handlers/pre-tool.ts";
import { handleSubagent } from "./handlers/subagent.ts";
import { hasAuthHeader, hasAuthQueryToken } from "../auth.ts";

type UpgradeServer = {
  upgrade(req: Request, options: { data: WSData }): boolean;
};

type DaemonFetchOptions = {
  authToken?: string;
};

const CLI_ENDPOINTS = new Set(["/inject", "/cap", "/kill", "/agents", "/status"]);
const HOOK_ENDPOINTS = new Set([
  "/hook/pre",
  "/hook/post",
  "/hook/subagent-start",
  "/hook/subagent-stop",
]);

function unauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

function isCliEndpoint(pathname: string): boolean {
  return CLI_ENDPOINTS.has(pathname);
}

function isHookEndpoint(pathname: string): boolean {
  return HOOK_ENDPOINTS.has(pathname);
}

function isWebSocketRequest(req: Request): boolean {
  return req.headers.get("upgrade")?.toLowerCase() === "websocket";
}

export function createDaemonFetch(
  db: Database,
  broadcast: (event: AgentEvent) => void,
  options: DaemonFetchOptions = {},
) {
  return async function fetchDaemon(
    req: Request,
    server?: UpgradeServer,
  ): Promise<Response | undefined> {
    const { pathname } = new URL(req.url);
    const { authToken } = options;

    if (
      authToken &&
      (isCliEndpoint(pathname) || isHookEndpoint(pathname)) &&
      !hasAuthHeader(req, authToken)
    ) {
      return unauthorized();
    }

    if (pathname === "/hook/pre" && req.method === "POST") {
      const body = await req.json();
      return Response.json(handlePreTool(body, db, broadcast));
    }

    if (pathname === "/hook/post" && req.method === "POST") {
      const body = await req.json();
      return Response.json(handlePostTool(body, db, broadcast));
    }

    if (pathname === "/hook/subagent-start" && req.method === "POST") {
      const body = await req.json();
      return Response.json(handleSubagent("start", body, db, broadcast));
    }

    if (pathname === "/hook/subagent-stop" && req.method === "POST") {
      const body = await req.json();
      return Response.json(handleSubagent("stop", body, db, broadcast));
    }

    if (pathname === "/inject" && req.method === "POST") {
      const { session_id, message } = (await req.json()) as InjectRequest;
      if (!getAgent(db, session_id)) {
        return Response.json({ ok: true, session_id, status: "not_found" });
      }

      createInjection(db, session_id, message);
      broadcast({
        type: "injection_delivered",
        session_id,
        message,
      });
      return Response.json({ ok: true, session_id, status: "queued" });
    }

    if (pathname === "/cap" && req.method === "POST") {
      const { session_id, tokens } = (await req.json()) as CapRequest;
      if (!getAgent(db, session_id)) {
        return Response.json({ ok: true, session_id, status: "not_found" });
      }

      setBudget(db, session_id, tokens);
      broadcast({ type: "agents_update", agents: getAgents(db) });
      return Response.json({ ok: true, session_id, status: "set", tokens });
    }

    if (pathname === "/kill" && req.method === "POST") {
      const { session_id } = (await req.json()) as KillRequest;
      const result = killAgent(db, session_id);
      if (result.status !== "not_found") {
        broadcast({ type: "agents_update", agents: getAgents(db) });
      }
      return Response.json(result);
    }

    if (pathname === "/agents" && req.method === "GET") {
      return Response.json(getAgents(db));
    }

    if (pathname === "/status" && req.method === "GET") {
      const agents = getAgents(db);
      const running = agents.filter((a) => a.status === "running").length;
      return Response.json({ ok: true, running, total: agents.length });
    }

    if (
      authToken &&
      server &&
      isWebSocketRequest(req) &&
      !hasAuthQueryToken(req, authToken)
    ) {
      return unauthorized();
    }

    if (server?.upgrade(req, { data: { connectedAt: Date.now() } })) {
      return undefined;
    }

    return new Response("Not found", { status: 404 });
  };
}
