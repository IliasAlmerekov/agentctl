import { Database } from "bun:sqlite";
import {
  cleanupOldRuntimeData,
  initSchema,
  getAgents,
  reconcileRunningAgents,
  recordDaemonHeartbeat,
  startDaemonRuntime,
} from "./db.ts";
import { createDaemonFetch } from "./http.ts";
import { mkdirSync } from "fs";
import type { WSData, AgentEvent } from "../types.ts";
import { readAuthToken } from "../auth.ts";
import { daemonListenOptions } from "../config.ts";

const dbDir = `${process.env.HOME}/.agentctl`;
mkdirSync(dbDir, { recursive: true });

export const db = new Database(`${dbDir}/agents.db`, { create: true });
db.exec("PRAGMA journal_mode = WAL");
initSchema(db);
reconcileRunningAgents(db);
cleanupOldRuntimeData(db);
const daemonBoot = startDaemonRuntime(db);
setInterval(() => recordDaemonHeartbeat(db, daemonBoot.boot_id), 30_000);
const authToken = readAuthToken();

const wsClients = new Set<import("bun").ServerWebSocket<WSData>>();

function broadcast(event: AgentEvent): void {
  const msg = JSON.stringify(event);
  for (const ws of wsClients) ws.send(msg);
}

Bun.serve<WSData>({
  ...daemonListenOptions(),
  fetch: createDaemonFetch(db, broadcast, { authToken }),

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

console.log("agentctl daemon listening on 127.0.0.1:47823");
