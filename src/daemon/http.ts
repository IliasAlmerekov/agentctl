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

export const CONTROL_BODY_LIMIT_BYTES = 1 * 1024 * 1024; // 1 MB
export const HOOK_BODY_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB
export const INJECTION_MESSAGE_LIMIT_BYTES = 64 * 1024; // 64 KB

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

function payloadTooLarge(limitBytes: number): Response {
  return Response.json(
    { ok: false, error: `payload exceeds ${limitBytes} bytes` },
    { status: 413 },
  );
}

function lengthRequired(): Response {
  return Response.json(
    { ok: false, error: "Content-Length header required" },
    { status: 411 },
  );
}

function badRequest(message: string): Response {
  return Response.json({ ok: false, error: message }, { status: 400 });
}

type ParsedBody<T> =
  | { ok: true; body: T }
  | { ok: false; response: Response };

async function readBoundedJson<T>(
  req: Request,
  maxBytes: number,
): Promise<ParsedBody<T>> {
  const declaredLength = req.headers.get("content-length");
  if (declaredLength === null) {
    return { ok: false, response: lengthRequired() };
  }
  const declared = Number(declaredLength);
  if (!Number.isInteger(declared) || declared < 0) {
    return { ok: false, response: badRequest("invalid content-length") };
  }
  if (declared > maxBytes) {
    return { ok: false, response: payloadTooLarge(maxBytes) };
  }

  const buffer = await req.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    return { ok: false, response: payloadTooLarge(maxBytes) };
  }
  try {
    const text = new TextDecoder().decode(buffer);
    return { ok: true, body: JSON.parse(text) as T };
  } catch {
    return { ok: false, response: badRequest("invalid json") };
  }
}

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).byteLength;
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
      const parsed = await readBoundedJson(req, HOOK_BODY_LIMIT_BYTES);
      if (!parsed.ok) return parsed.response;
      return Response.json(handlePreTool(parsed.body as never, db, broadcast));
    }

    if (pathname === "/hook/post" && req.method === "POST") {
      const parsed = await readBoundedJson(req, HOOK_BODY_LIMIT_BYTES);
      if (!parsed.ok) return parsed.response;
      return Response.json(handlePostTool(parsed.body as never, db, broadcast));
    }

    if (pathname === "/hook/subagent-start" && req.method === "POST") {
      const parsed = await readBoundedJson(req, HOOK_BODY_LIMIT_BYTES);
      if (!parsed.ok) return parsed.response;
      return Response.json(
        handleSubagent("start", parsed.body as never, db, broadcast),
      );
    }

    if (pathname === "/hook/subagent-stop" && req.method === "POST") {
      const parsed = await readBoundedJson(req, HOOK_BODY_LIMIT_BYTES);
      if (!parsed.ok) return parsed.response;
      return Response.json(
        handleSubagent("stop", parsed.body as never, db, broadcast),
      );
    }

    if (pathname === "/inject" && req.method === "POST") {
      const parsed = await readBoundedJson<InjectRequest>(
        req,
        CONTROL_BODY_LIMIT_BYTES,
      );
      if (!parsed.ok) return parsed.response;

      const { session_id, message } = parsed.body;

      if (
        typeof message === "string" &&
        utf8ByteLength(message) > INJECTION_MESSAGE_LIMIT_BYTES
      ) {
        return badRequest(
          `injection message exceeds ${INJECTION_MESSAGE_LIMIT_BYTES} bytes (64 KB UTF-8)`,
        );
      }

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
      const parsed = await readBoundedJson<CapRequest>(
        req,
        CONTROL_BODY_LIMIT_BYTES,
      );
      if (!parsed.ok) return parsed.response;

      const { session_id, tokens } = parsed.body;
      if (!getAgent(db, session_id)) {
        return Response.json({ ok: true, session_id, status: "not_found" });
      }

      setBudget(db, session_id, tokens);
      broadcast({ type: "agents_update", agents: getAgents(db) });
      return Response.json({ ok: true, session_id, status: "set", tokens });
    }

    if (pathname === "/kill" && req.method === "POST") {
      const parsed = await readBoundedJson<KillRequest>(
        req,
        CONTROL_BODY_LIMIT_BYTES,
      );
      if (!parsed.ok) return parsed.response;

      const result = killAgent(db, parsed.body.session_id);
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
