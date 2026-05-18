import type { Database } from "bun:sqlite";
import type { ServerWebSocket } from "bun";
import { getAgents } from "./db.ts";
import type { WSData } from "../types.ts";

export type WsHandlers = {
  open: (ws: ServerWebSocket<WSData>) => void;
  close: (ws: ServerWebSocket<WSData>) => void;
  message: (ws: ServerWebSocket<WSData>, msg: string | Buffer) => void;
};

export function createWsHandlers(
  db: Database,
  clients: Set<ServerWebSocket<WSData>>,
  authToken: string,
): WsHandlers {
  return {
    open(_ws) {
      // Auth happens via first message; nothing to do here.
    },

    close(ws) {
      clients.delete(ws);
    },

    message(ws, msg) {
      if (ws.data.authenticated) return;

      try {
        const parsed = JSON.parse(msg.toString()) as unknown;
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          (parsed as Record<string, unknown>).type === "auth" &&
          (parsed as Record<string, unknown>).token === authToken
        ) {
          ws.data.authenticated = true;
          clients.add(ws);
          ws.send(JSON.stringify({ type: "agents_update", agents: getAgents(db) }));
          return;
        }
      } catch {
        // fall through to close
      }

      ws.close(4401);
    },
  };
}
