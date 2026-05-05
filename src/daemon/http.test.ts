import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "./db.ts";
import { createDaemonFetch } from "./http.ts";
import type { AgentEvent } from "../types.ts";

function createTestDb(): Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

async function jsonRequest(
  path: string,
  body: unknown,
  token?: string,
): Promise<Request> {
  return new Request(`http://agentctl.test${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Agentctl-Token": token } : {}),
    },
    body: JSON.stringify(body),
  });
}

function getRequest(path: string, token?: string): Request {
  return new Request(`http://agentctl.test${path}`, {
    headers: token ? { "X-Agentctl-Token": token } : {},
  });
}

function websocketRequest(path: string): Request {
  return new Request(`http://agentctl.test${path}`, {
    headers: { Upgrade: "websocket" },
  });
}

function expectResponse(response: Response | undefined): Response {
  expect(response).toBeInstanceOf(Response);
  return response as Response;
}

describe("daemon HTTP endpoints", () => {
  test("covers inject, cap, kill, agents, and status", async () => {
    const db = createTestDb();
    const events: AgentEvent[] = [];
    const fetchDaemon = createDaemonFetch(db, (event) => events.push(event), {
      authToken: "test-token",
    });

    db.run(
      `INSERT INTO agents (session_id, status, depth, tokens_used, started_at)
       VALUES (?, 'running', 0, 0, ?)`,
      ["agent-a", Date.now()],
    );
    db.run(
      `INSERT INTO agents (session_id, status, depth, tokens_used, started_at)
       VALUES (?, 'running', 0, 0, ?)`,
      ["agent-b", Date.now() + 1],
    );

    const injectResponse = expectResponse(
      await fetchDaemon(
        await jsonRequest("/inject", {
          session_id: "agent-a",
          message: "use sqlite",
        },
        "test-token"),
      ),
    );
    const capResponse = expectResponse(
      await fetchDaemon(
        await jsonRequest(
          "/cap",
          { session_id: "agent-a", tokens: 50 },
          "test-token",
        ),
      ),
    );
    const killResponse = expectResponse(
      await fetchDaemon(
        await jsonRequest("/kill", { session_id: "agent-b" }, "test-token"),
      ),
    );
    const agentsResponse = expectResponse(
      await fetchDaemon(getRequest("/agents", "test-token")),
    );
    const statusResponse = expectResponse(
      await fetchDaemon(getRequest("/status", "test-token")),
    );

    const injection = db
      .query<{ message: string; status: string }, string>(
        "SELECT message, status FROM injections WHERE session_id = ?",
      )
      .get("agent-a");
    const agentA = db
      .query<{ token_budget: number | null }, string>(
        "SELECT token_budget FROM agents WHERE session_id = ?",
      )
      .get("agent-a");
    const agentB = db
      .query<{ status: string }, string>(
        "SELECT status FROM agents WHERE session_id = ?",
      )
      .get("agent-b");

    expect(await injectResponse.json()).toEqual({ ok: true });
    expect(await capResponse.json()).toEqual({ ok: true });
    expect(await killResponse.json()).toEqual({
      ok: true,
      session_id: "agent-b",
      status: "killed",
    });
    expect(await agentsResponse.json()).toEqual([
      expect.objectContaining({ session_id: "agent-b", status: "killed" }),
      expect.objectContaining({ session_id: "agent-a", status: "running" }),
    ]);
    expect(await statusResponse.json()).toEqual({
      ok: true,
      running: 1,
      total: 2,
    });
    expect(injection).toEqual({ message: "use sqlite", status: "pending" });
    expect(agentA?.token_budget).toBe(50);
    expect(agentB?.status).toBe("killed");
    expect(events).toContainEqual({
      type: "injection_delivered",
      session_id: "agent-a",
      message: "use sqlite",
    });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "agents_update" }),
    );
  });

  test("requires auth token for CLI HTTP endpoints", async () => {
    const db = createTestDb();
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: "test-token",
    });

    const protectedRequests = [
      await jsonRequest("/inject", {
        session_id: "agent-a",
        message: "use sqlite",
      }),
      await jsonRequest("/cap", { session_id: "agent-a", tokens: 50 }),
      await jsonRequest("/kill", { session_id: "agent-a" }),
      getRequest("/agents"),
      getRequest("/status"),
    ];

    for (const request of protectedRequests) {
      const missingAuth = expectResponse(await fetchDaemon(request));
      expect(missingAuth.status).toBe(401);
      expect(await missingAuth.json()).toEqual({
        ok: false,
        error: "unauthorized",
      });
    }

    const invalidAuth = expectResponse(
      await fetchDaemon(
        await jsonRequest(
          "/inject",
          {
            session_id: "agent-a",
            message: "use sqlite",
          },
          "wrong-token",
        ),
      ),
    );
    const validAuth = expectResponse(
      await fetchDaemon(
        await jsonRequest(
          "/inject",
          {
            session_id: "agent-a",
            message: "use sqlite",
          },
          "test-token",
        ),
      ),
    );

    expect(invalidAuth.status).toBe(401);
    expect(await invalidAuth.json()).toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(validAuth.status).toBe(200);
    expect(await validAuth.json()).toEqual({ ok: true });
  });

  test("requires auth token for websocket access", async () => {
    const db = createTestDb();
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: "test-token",
    });
    const server = {
      upgraded: false,
      upgrade() {
        this.upgraded = true;
        return true;
      },
    };

    const missingAuth = expectResponse(
      await fetchDaemon(websocketRequest("/watch"), server),
    );
    const invalidAuth = expectResponse(
      await fetchDaemon(websocketRequest("/watch?token=wrong-token"), server),
    );
    const validAuth = await fetchDaemon(
      websocketRequest("/watch?token=test-token"),
      server,
    );

    expect(missingAuth.status).toBe(401);
    expect(invalidAuth.status).toBe(401);
    expect(validAuth).toBeUndefined();
    expect(server.upgraded).toBe(true);
  });

  test("requires the same auth token for hook endpoints", async () => {
    const db = createTestDb();
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: "test-token",
    });

    const missingAuth = expectResponse(
      await fetchDaemon(
        await jsonRequest("/hook/pre", {
          session_id: "hook-session",
          tool_name: "Bash",
          tool_input: { command: "rtk test" },
        }),
      ),
    );
    const validAuth = expectResponse(
      await fetchDaemon(
        await jsonRequest(
          "/hook/pre",
          {
            session_id: "hook-session",
            tool_name: "Bash",
            tool_input: { command: "rtk test" },
          },
          "test-token",
        ),
      ),
    );

    expect(missingAuth.status).toBe(401);
    expect(await missingAuth.json()).toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(validAuth.status).toBe(200);
    expect(await validAuth.json()).toEqual({ block: false });
  });
});
