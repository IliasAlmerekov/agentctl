import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { authTokenPath, readAuthToken } from "../auth.ts";
import { DAEMON_HOST, DAEMON_PORT, daemonListenOptions } from "../config.ts";
import type { AgentEvent, WSData } from "../types.ts";
import { getAgents, prepareDaemonDatabase, recordDaemonHeartbeat } from "./db.ts";
import { createDaemonFetch } from "./http.ts";

type ServeFn = typeof Bun.serve;
type SetIntervalFn = typeof setInterval;

export type StartDaemonOptions = {
  home?: string;
  logger?: Pick<Console, "log">;
  serve?: ServeFn;
  setIntervalFn?: SetIntervalFn;
};

export type DaemonRuntime = {
  db: Database;
  heartbeatTimer: ReturnType<SetIntervalFn>;
  server: ReturnType<ServeFn>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function isMissingFileError(error: unknown): boolean {
  return errorCode(error) === "ENOENT" || errorMessage(error).includes("ENOENT");
}

function isPortInUseError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    errorCode(error) === "EADDRINUSE" ||
    message.includes("eaddrinuse") ||
    message.includes("address already in use")
  );
}

export function formatDaemonStartupError(
  error: unknown,
  home = process.env.HOME,
): Error {
  const tokenPath = home ? authTokenPath(home) : "~/.agentctl/auth-token";

  if (isMissingFileError(error)) {
    return new Error(
      `agentctl daemon cannot start: missing auth token at ${tokenPath}. Re-run install.sh to generate it.`,
    );
  }

  if (errorMessage(error) === "agentctl auth token is empty") {
    return new Error(
      `agentctl daemon cannot start: auth token at ${tokenPath} is empty. Re-run install.sh or replace it with a non-empty token.`,
    );
  }

  if (isPortInUseError(error)) {
    return new Error(
      `agentctl daemon cannot start: ${DAEMON_HOST}:${DAEMON_PORT} is already in use. Stop the existing agentctl-daemon or free the port, then restart.`,
    );
  }

  return new Error(`agentctl daemon cannot start: ${errorMessage(error)}`);
}

export function startDaemon(options: StartDaemonOptions = {}): DaemonRuntime {
  const home = options.home ?? process.env.HOME;
  const serve = options.serve ?? Bun.serve;
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const logger = options.logger ?? console;

  try {
    const authToken = readAuthToken(home);
    const dbDir = `${home}/.agentctl`;
    mkdirSync(dbDir, { recursive: true });

    const db = new Database(`${dbDir}/agents.db`, { create: true });
    db.exec("PRAGMA journal_mode = WAL");
    const daemonBoot = prepareDaemonDatabase(db);
    const wsClients = new Set<import("bun").ServerWebSocket<WSData>>();

    function broadcast(event: AgentEvent): void {
      const msg = JSON.stringify(event);
      for (const ws of wsClients) ws.send(msg);
    }

    const server = serve<WSData>({
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

    const heartbeatTimer = setIntervalFn(
      () => recordDaemonHeartbeat(db, daemonBoot.boot_id),
      30_000,
    );

    logger.log(`agentctl daemon listening on ${DAEMON_HOST}:${DAEMON_PORT}`);
    return { db, heartbeatTimer, server };
  } catch (error) {
    throw formatDaemonStartupError(error, home);
  }
}
