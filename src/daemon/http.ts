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
import { hasAuthHeader } from "../auth.ts";

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

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateSessionId(body: unknown): ValidationResult<string> {
  if (!isRecord(body) || !("session_id" in body)) {
    return { ok: false, error: "session_id must be a non-empty string" };
  }

  const { session_id } = body;
  if (typeof session_id !== "string") {
    return { ok: false, error: "session_id must be a non-empty string" };
  }
  if (session_id.trim().length === 0) {
    return { ok: false, error: "session_id must be a non-empty string" };
  }
  if (session_id !== session_id.trim()) {
    return { ok: false, error: "session_id must be a non-empty string" };
  }

  return { ok: true, value: session_id };
}

function validateInjectRequest(body: unknown): ValidationResult<InjectRequest> {
  const sessionId = validateSessionId(body);
  if (!sessionId.ok) {
    return sessionId;
  }

  if (!isRecord(body) || !("message" in body)) {
    return { ok: false, error: "message must be a non-empty string" };
  }

  const { message } = body;
  if (typeof message !== "string") {
    return { ok: false, error: "message must be a non-empty string" };
  }
  if (message.trim().length === 0) {
    return { ok: false, error: "message must be a non-empty string" };
  }
  if (utf8ByteLength(message) > INJECTION_MESSAGE_LIMIT_BYTES) {
    return {
      ok: false,
      error: `injection message exceeds ${INJECTION_MESSAGE_LIMIT_BYTES} bytes (64 KB UTF-8)`,
    };
  }

  return {
    ok: true,
    value: {
      session_id: sessionId.value,
      message,
    },
  };
}

function validateCapRequest(body: unknown): ValidationResult<CapRequest> {
  const sessionId = validateSessionId(body);
  if (!sessionId.ok) {
    return sessionId;
  }

  if (!isRecord(body) || !("tokens" in body)) {
    return { ok: false, error: "tokens must be a positive integer" };
  }

  const { tokens } = body;
  if (
    typeof tokens !== "number" ||
    !Number.isSafeInteger(tokens) ||
    tokens < 1
  ) {
    return { ok: false, error: "tokens must be a positive integer" };
  }

  return {
    ok: true,
    value: {
      session_id: sessionId.value,
      tokens,
    },
  };
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
      const validated = validateInjectRequest(parsed.body);
      if (!validated.ok) return badRequest(validated.error);

      const { session_id, message } = validated.value;

      const agent = getAgent(db, session_id);
      if (!agent) {
        return Response.json({ ok: true, session_id, status: "not_found" });
      }
      if (agent.status !== "running") {
        return Response.json({ ok: true, session_id, status: "not_running" });
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
      const validated = validateCapRequest(parsed.body);
      if (!validated.ok) return badRequest(validated.error);

      const { session_id, tokens } = validated.value;
      const capAgent = getAgent(db, session_id);
      if (!capAgent) {
        return Response.json({ ok: true, session_id, status: "not_found" });
      }
      if (capAgent.status !== "running") {
        return Response.json({ ok: true, session_id, status: "not_running" });
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

      const sessionValidation = validateSessionId(parsed.body);
      if (!sessionValidation.ok) {
        return Response.json(
          { ok: false, error: sessionValidation.error },
          { status: 400 },
        );
      }

      const result = killAgent(db, sessionValidation.value);
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

    if (server?.upgrade(req, { data: { connectedAt: Date.now(), authenticated: false } })) {
      return undefined;
    }

    return new Response("Not found", { status: 404 });
  };
}
