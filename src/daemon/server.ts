import { Database } from "bun:sqlite";
import { handlePreTool } from "./handlers/pre-tool.ts";
import { handlePostTool } from "./handlers/post-tool.ts";
import { handleSubagent } from "./handlers/subagent.ts";
import { initSchema, getAgents } from "./db.ts";
import { createInjection } from "./injections.ts";
import { setBudget, getAgent } from "./budget.ts";
import { mkdirSync } from "fs";
import type {
  WSData,
  AgentEvent,
  InjectRequest,
  CapRequest,
  KillRequest,
} from "../types.ts";

const dbDir = `${process.env.HOME}/.agentctl`;
mkdirSync(dbDir, { recursive: true });

export const db = new Database(`${dbDir}/agents.db`, { create: true });
db.exec("PRAGMA journal_mode = WAL");
initSchema(db);

const wsClients = new Set<import("bun").ServerWebSocket<WSData>>();

function broadcast(event: AgentEvent): void {
  const msg = JSON.stringify(event);
  for (const ws of wsClients) ws.send(msg);
}

Bun.serve<WSData>({
  port: 47823,

  async fetch(req, server) {
    const { pathname } = new URL(req.url);

    if (pathname === "/hook/pre" && req.method === "POST") {
      const body = await req.json();
      return Response.json(handlePreTool(body, db));
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
      createInjection(db, session_id, message);
      broadcast({
        type: "injection_delivered",
        session_id,
        message,
      });
      return Response.json({ ok: true });
    }

    if (pathname === "/cap" && req.method === "POST") {
      const { session_id, tokens } = (await req.json()) as CapRequest;
      setBudget(db, session_id, tokens);
      broadcast({ type: "agents_update", agents: getAgents(db) });
      return Response.json({ ok: true });
    }

    if (pathname === "/kill" && req.method === "POST") {
      const { session_id } = (await req.json()) as KillRequest;
      db.run(
        "UPDATE agents SET status = 'killed', ended_at = ? WHERE session_id = ?",
        [Date.now(), session_id],
      );
      broadcast({ type: "agents_update", agents: getAgents(db) });
      return Response.json({ ok: true });
    }

    if (pathname === "/agents" && req.method === "GET") {
      return Response.json(getAgents(db));
    }

    if (pathname === "/status" && req.method === "GET") {
      const agents = getAgents(db);
      const running = agents.filter((a) => a.status === "running").length;
      return Response.json({ ok: true, running, total: agents.length });
    }

    if (server.upgrade(req, { data: { connectedAt: Date.now() } })) {
      return undefined;
    }

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {
      wsClients.add(ws);
      ws.send(JSON.stringify({ type: "agents_update", agents: getAgents(db) }));
    },
    close(ws) {
      wsClients.delete(ws);
    },
    message() {},
  },
});

console.log("agentctl daemon listening on :47823");
