import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "./db.ts";
import { createDaemonFetch } from "./http.ts";
import type { AgentEvent } from "../types.ts";

const TEST_TOKEN = "test-token";
const WRONG_TOKEN = "wrong-token";
const UNAUTHORIZED_BODY = { ok: false, error: "unauthorized" };

function createTestDb(): Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

function jsonRequest(
  path: string,
  body: unknown,
  token?: string,
): Request {
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

async function expectUnauthorized(response: Response | undefined): Promise<void> {
  const unauthorized = expectResponse(response);
  expect(unauthorized.status).toBe(401);
  expect(await unauthorized.json()).toEqual(UNAUTHORIZED_BODY);
}

describe("daemon HTTP endpoints", () => {
  test("covers inject, cap, kill, agents, and status", async () => {
    const db = createTestDb();
    const events: AgentEvent[] = [];
    const fetchDaemon = createDaemonFetch(db, (event) => events.push(event), {
      authToken: TEST_TOKEN,
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
        jsonRequest(
          "/inject",
          {
            session_id: "agent-a",
            message: "use sqlite",
          },
          TEST_TOKEN,
        ),
      ),
    );
    const capResponse = expectResponse(
      await fetchDaemon(
        jsonRequest(
          "/cap",
          { session_id: "agent-a", tokens: 50 },
          TEST_TOKEN,
        ),
      ),
    );
    const killResponse = expectResponse(
      await fetchDaemon(
        jsonRequest("/kill", { session_id: "agent-b" }, TEST_TOKEN),
      ),
    );
    const agentsResponse = expectResponse(
      await fetchDaemon(getRequest("/agents", TEST_TOKEN)),
    );
    const statusResponse = expectResponse(
      await fetchDaemon(getRequest("/status", TEST_TOKEN)),
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

  test("covers missing, invalid, and valid auth for CLI HTTP endpoints", async () => {
    const db = createTestDb();
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: TEST_TOKEN,
    });

    const protectedEndpoints = [
      {
        name: "inject",
        request: (token?: string) =>
          jsonRequest(
            "/inject",
            {
              session_id: "agent-a",
              message: "use sqlite",
            },
            token,
          ),
        expectedBody: { ok: true },
      },
      {
        name: "cap",
        request: (token?: string) =>
          jsonRequest("/cap", { session_id: "agent-a", tokens: 50 }, token),
        expectedBody: { ok: true },
      },
      {
        name: "kill",
        request: (token?: string) =>
          jsonRequest("/kill", { session_id: "agent-a" }, token),
        expectedBody: {
          ok: true,
          session_id: "agent-a",
          status: "not_found",
        },
      },
      {
        name: "agents",
        request: (token?: string) => getRequest("/agents", token),
        expectedBody: [],
      },
      {
        name: "status",
        request: (token?: string) => getRequest("/status", token),
        expectedBody: { ok: true, running: 0, total: 0 },
      },
    ];

    for (const endpoint of protectedEndpoints) {
      await expectUnauthorized(await fetchDaemon(endpoint.request()));
      await expectUnauthorized(await fetchDaemon(endpoint.request(WRONG_TOKEN)));

      const validAuth = expectResponse(
        await fetchDaemon(endpoint.request(TEST_TOKEN)),
      );
      expect(validAuth.status, endpoint.name).toBe(200);
      expect(await validAuth.json()).toEqual(endpoint.expectedBody);
    }
  });

  test("covers missing, invalid, and valid auth for websocket access", async () => {
    const db = createTestDb();
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: TEST_TOKEN,
    });
    let upgrades = 0;
    const server = {
      upgrade() {
        upgrades += 1;
        return true;
      },
    };

    await expectUnauthorized(
      await fetchDaemon(websocketRequest("/watch"), server),
    );
    await expectUnauthorized(
      await fetchDaemon(websocketRequest(`/watch?token=${WRONG_TOKEN}`), server),
    );
    const validAuth = await fetchDaemon(
      websocketRequest(`/watch?token=${TEST_TOKEN}`),
      server,
    );

    expect(validAuth).toBeUndefined();
    expect(upgrades).toBe(1);
  });

  test("covers missing, invalid, and valid auth for hook endpoints", async () => {
    const db = createTestDb();
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: TEST_TOKEN,
    });

    const hookEndpoints = [
      {
        name: "pre",
        request: (token?: string) =>
          jsonRequest(
            "/hook/pre",
            {
              session_id: "hook-session",
              tool_name: "Bash",
              tool_input: { command: "rtk test" },
            },
            token,
          ),
        expectedBody: { block: false },
      },
      {
        name: "post",
        request: (token?: string) =>
          jsonRequest(
            "/hook/post",
            {
              session_id: "hook-session",
              tool_name: "Bash",
              tool_input: { command: "rtk test" },
              tool_response: { ok: true },
              tokens_used: 1,
            },
            token,
          ),
        expectedBody: { ok: true },
      },
      {
        name: "subagent-start",
        request: (token?: string) =>
          jsonRequest(
            "/hook/subagent-start",
            {
              session_id: "hook-session",
              description: "auth coverage",
            },
            token,
          ),
        expectedBody: { ok: true },
      },
      {
        name: "subagent-stop",
        request: (token?: string) =>
          jsonRequest(
            "/hook/subagent-stop",
            {
              session_id: "hook-session",
            },
            token,
          ),
        expectedBody: { ok: true },
      },
    ];

    for (const endpoint of hookEndpoints) {
      await expectUnauthorized(await fetchDaemon(endpoint.request()));
      await expectUnauthorized(await fetchDaemon(endpoint.request(WRONG_TOKEN)));

      const validAuth = expectResponse(
        await fetchDaemon(endpoint.request(TEST_TOKEN)),
      );
      expect(validAuth.status, endpoint.name).toBe(200);
      expect(await validAuth.json()).toEqual(endpoint.expectedBody);
    }
  });
});
