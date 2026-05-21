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
  const serialized = JSON.stringify(body);
  return new Request(`http://agentctl.test${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(new TextEncoder().encode(serialized).byteLength),
      ...(token ? { "X-Agentctl-Token": token } : {}),
    },
    body: serialized,
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

    expect(await injectResponse.json()).toEqual({
      ok: true,
      session_id: "agent-a",
      status: "queued",
    });
    expect(await capResponse.json()).toEqual({
      ok: true,
      session_id: "agent-a",
      status: "set",
      tokens: 50,
    });
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
        expectedBody: {
          ok: true,
          session_id: "agent-a",
          status: "not_found",
        },
      },
      {
        name: "cap",
        request: (token?: string) =>
          jsonRequest("/cap", { session_id: "agent-a", tokens: 50 }, token),
        expectedBody: {
          ok: true,
          session_id: "agent-a",
          status: "not_found",
        },
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

  test("returns not_found for unknown-session inject and cap without side effects", async () => {
    const db = createTestDb();
    const events: AgentEvent[] = [];
    const fetchDaemon = createDaemonFetch(db, (event) => events.push(event), {
      authToken: TEST_TOKEN,
    });

    const injectResponse = expectResponse(
      await fetchDaemon(
        jsonRequest(
          "/inject",
          {
            session_id: "missing-agent",
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
          { session_id: "missing-agent", tokens: 50 },
          TEST_TOKEN,
        ),
      ),
    );
    const injectionCount = db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM injections WHERE session_id = 'missing-agent'",
      )
      .get();
    const updatedAgent = db
      .query<{ token_budget: number | null }, string>(
        "SELECT token_budget FROM agents WHERE session_id = ?",
      )
      .get("missing-agent");

    expect(await injectResponse.json()).toEqual({
      ok: true,
      session_id: "missing-agent",
      status: "not_found",
    });
    expect(await capResponse.json()).toEqual({
      ok: true,
      session_id: "missing-agent",
      status: "not_found",
    });
    expect(injectionCount?.count).toBe(0);
    expect(updatedAgent).toBeNull();
    expect(events).toEqual([]);
  });

  test("returns not_running for inject and cap against non-running agents without side effects", async () => {
    const db = createTestDb();
    const events: AgentEvent[] = [];
    const fetchDaemon = createDaemonFetch(db, (event) => events.push(event), {
      authToken: TEST_TOKEN,
    });

    db.run(
      `INSERT INTO agents (session_id, status, depth, tokens_used, started_at)
       VALUES (?, 'killed', 0, 0, ?)`,
      ["killed-agent", Date.now()],
    );
    db.run(
      `INSERT INTO agents (session_id, status, depth, tokens_used, started_at)
       VALUES (?, 'done', 0, 0, ?)`,
      ["done-agent", Date.now() + 1],
    );

    const injectKilledResponse = expectResponse(
      await fetchDaemon(
        jsonRequest("/inject", { session_id: "killed-agent", message: "hello" }, TEST_TOKEN),
      ),
    );
    const injectDoneResponse = expectResponse(
      await fetchDaemon(
        jsonRequest("/inject", { session_id: "done-agent", message: "hello" }, TEST_TOKEN),
      ),
    );
    const capKilledResponse = expectResponse(
      await fetchDaemon(
        jsonRequest("/cap", { session_id: "killed-agent", tokens: 100 }, TEST_TOKEN),
      ),
    );
    const capDoneResponse = expectResponse(
      await fetchDaemon(
        jsonRequest("/cap", { session_id: "done-agent", tokens: 100 }, TEST_TOKEN),
      ),
    );

    const killedInjectionCount = db
      .query<{ count: number }, string>(
        "SELECT COUNT(*) as count FROM injections WHERE session_id = ?",
      )
      .get("killed-agent");
    const doneInjectionCount = db
      .query<{ count: number }, string>(
        "SELECT COUNT(*) as count FROM injections WHERE session_id = ?",
      )
      .get("done-agent");
    const killedBudget = db
      .query<{ token_budget: number | null }, string>(
        "SELECT token_budget FROM agents WHERE session_id = ?",
      )
      .get("killed-agent");
    const doneBudget = db
      .query<{ token_budget: number | null }, string>(
        "SELECT token_budget FROM agents WHERE session_id = ?",
      )
      .get("done-agent");

    expect(await injectKilledResponse.json()).toEqual({
      ok: true,
      session_id: "killed-agent",
      status: "not_running",
    });
    expect(await injectDoneResponse.json()).toEqual({
      ok: true,
      session_id: "done-agent",
      status: "not_running",
    });
    expect(await capKilledResponse.json()).toEqual({
      ok: true,
      session_id: "killed-agent",
      status: "not_running",
    });
    expect(await capDoneResponse.json()).toEqual({
      ok: true,
      session_id: "done-agent",
      status: "not_running",
    });
    expect(killedInjectionCount?.count).toBe(0);
    expect(doneInjectionCount?.count).toBe(0);
    expect(killedBudget?.token_budget).toBeNull();
    expect(doneBudget?.token_budget).toBeNull();
    expect(events).toEqual([]);
  });

  test("accepts websocket upgrade without token in URL; auth happens via first message", async () => {
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

    const result = await fetchDaemon(websocketRequest("/watch"), server);

    expect(result).toBeUndefined();
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

describe("daemon HTTP body limits and validation", () => {
  function rawRequest(
    path: string,
    body: string,
    token = TEST_TOKEN,
  ): Request {
    return new Request(`http://agentctl.test${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(new TextEncoder().encode(body).byteLength),
        "X-Agentctl-Token": token,
      },
      body,
    });
  }

  function seedAgent(db: Database, sessionId: string): void {
    db.run(
      "INSERT INTO agents (session_id, status, started_at) VALUES (?, 'running', 0)",
      [sessionId],
    );
  }

  test("returns 400 for malformed JSON on control endpoints", async () => {
    const db = createTestDb();
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: TEST_TOKEN,
    });

    const res = expectResponse(
      await fetchDaemon(rawRequest("/inject", "{not json")),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid json/i);
  });

  test("returns 400 for malformed JSON on hook endpoints", async () => {
    const db = createTestDb();
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: TEST_TOKEN,
    });

    const res = expectResponse(
      await fetchDaemon(rawRequest("/hook/pre", "{broken")),
    );
    expect(res.status).toBe(400);
  });

  test("rejects via Content-Length header before reading the body", async () => {
    const db = createTestDb();
    initSchema(db);
    db.run(
      "INSERT INTO agents (session_id, status, started_at) VALUES ('exists', 'running', 0)",
    );
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: TEST_TOKEN,
    });

    // Real body is small and would parse to a valid request for an existing
    // agent (would normally return status "queued"). The Content-Length
    // header claims 5 MB, exceeding the 1 MB control limit. If the
    // implementation reads the body before checking Content-Length, it would
    // succeed with status "queued" — we expect 413 instead, proving the
    // pre-check fires without buffering.
    const realBody = JSON.stringify({ session_id: "exists", message: "hi" });
    const req = new Request("http://agentctl.test/inject", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "5000000",
        "X-Agentctl-Token": TEST_TOKEN,
      },
      body: realBody,
    });

    const res = expectResponse(await fetchDaemon(req));
    expect(res.status).toBe(413);
  });

  test("rejects POST without Content-Length on bounded endpoints", async () => {
    const db = createTestDb();
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: TEST_TOKEN,
    });

    const req = new Request("http://agentctl.test/inject", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agentctl-Token": TEST_TOKEN,
      },
    });

    const res = expectResponse(await fetchDaemon(req));
    expect(res.status).toBe(411);
  });

  test("returns 413 when control endpoint body exceeds 1 MB", async () => {
    const db = createTestDb();
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: TEST_TOKEN,
    });

    const oversized = JSON.stringify({
      session_id: "x",
      message: "a".repeat(1_100_000),
    });

    const res = expectResponse(
      await fetchDaemon(rawRequest("/inject", oversized)),
    );
    expect(res.status).toBe(413);
  });

  test("returns 413 when hook endpoint body exceeds 10 MB", async () => {
    const db = createTestDb();
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: TEST_TOKEN,
    });

    const oversized = JSON.stringify({
      session_id: "x",
      tool_name: "Bash",
      tool_input: { data: "a".repeat(11_000_000) },
    });

    const res = expectResponse(
      await fetchDaemon(rawRequest("/hook/pre", oversized)),
    );
    expect(res.status).toBe(413);
  });

  test("hook endpoint accepts 5 MB body within 10 MB limit", async () => {
    const db = createTestDb();
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: TEST_TOKEN,
    });

    const fivemb = JSON.stringify({
      session_id: "ok-session",
      tool_name: "Bash",
      tool_input: { data: "a".repeat(5_000_000) },
    });

    const res = expectResponse(
      await fetchDaemon(rawRequest("/hook/pre", fivemb)),
    );
    expect(res.status).toBe(200);
  });

  test("rejects invalid inject payloads with 400 before not_found or DB writes", async () => {
    const invalidCases = [
      {
        name: "missing session_id",
        body: { message: "hello" },
        error: "session_id must be a non-empty string",
      },
      {
        name: "session_id wrong type",
        body: { session_id: 123, message: "hello" },
        error: "session_id must be a non-empty string",
      },
      {
        name: "session_id whitespace-only",
        body: { session_id: "   ", message: "hello" },
        error: "session_id must be a non-empty string",
      },
      {
        name: "session_id has surrounding whitespace",
        body: { session_id: " missing-agent ", message: "hello" },
        error: "session_id must be a non-empty string",
      },
      {
        name: "missing message",
        body: { session_id: "missing-agent" },
        error: "message must be a non-empty string",
      },
      {
        name: "message wrong type",
        body: { session_id: "missing-agent", message: null },
        error: "message must be a non-empty string",
      },
      {
        name: "message whitespace-only",
        body: { session_id: "missing-agent", message: "   " },
        error: "message must be a non-empty string",
      },
    ] as const;

    for (const invalidCase of invalidCases) {
      const db = createTestDb();
      const fetchDaemon = createDaemonFetch(db, () => {}, {
        authToken: TEST_TOKEN,
      });

      const res = expectResponse(
        await fetchDaemon(jsonRequest("/inject", invalidCase.body, TEST_TOKEN)),
      );
      expect(res.status, invalidCase.name).toBe(400);
      expect(await res.json()).toEqual({
        ok: false,
        error: invalidCase.error,
      });

      const injectionCount = db
        .query<{ count: number }, []>("SELECT COUNT(*) as count FROM injections")
        .get();
      const missingAgent = db
        .query<{ session_id: string }, string>(
          "SELECT session_id FROM agents WHERE session_id = ?",
        )
        .get("missing-agent");

      expect(injectionCount?.count, invalidCase.name).toBe(0);
      expect(missingAgent, invalidCase.name).toBeNull();
    }
  });

  test("rejects invalid cap payloads with 400 before not_found or DB writes", async () => {
    const invalidCases = [
      {
        name: "missing session_id",
        body: { tokens: 1 },
        error: "session_id must be a non-empty string",
      },
      {
        name: "session_id wrong type",
        body: { session_id: false, tokens: 1 },
        error: "session_id must be a non-empty string",
      },
      {
        name: "session_id whitespace-only",
        body: { session_id: "   ", tokens: 1 },
        error: "session_id must be a non-empty string",
      },
      {
        name: "session_id has surrounding whitespace",
        body: { session_id: " agent-a ", tokens: 1 },
        error: "session_id must be a non-empty string",
      },
      {
        name: "missing tokens",
        body: { session_id: "agent-a" },
        error: "tokens must be a positive integer",
      },
      {
        name: "tokens wrong type",
        body: { session_id: "agent-a", tokens: "10" },
        error: "tokens must be a positive integer",
      },
      {
        name: "tokens zero",
        body: { session_id: "agent-a", tokens: 0 },
        error: "tokens must be a positive integer",
      },
      {
        name: "tokens negative",
        body: { session_id: "agent-a", tokens: -1 },
        error: "tokens must be a positive integer",
      },
      {
        name: "tokens fractional",
        body: { session_id: "agent-a", tokens: 1.5 },
        error: "tokens must be a positive integer",
      },
    ] as const;

    for (const invalidCase of invalidCases) {
      const db = createTestDb();
      seedAgent(db, "agent-a");
      const fetchDaemon = createDaemonFetch(db, () => {}, {
        authToken: TEST_TOKEN,
      });

      const tokenBudgetBefore = db
        .query<{ token_budget: number | null }, string>(
          "SELECT token_budget FROM agents WHERE session_id = ?",
        )
        .get("agent-a");

      const res = expectResponse(
        await fetchDaemon(jsonRequest("/cap", invalidCase.body, TEST_TOKEN)),
      );
      expect(res.status, invalidCase.name).toBe(400);
      expect(await res.json()).toEqual({
        ok: false,
        error: invalidCase.error,
      });

      const tokenBudgetAfter = db
        .query<{ token_budget: number | null }, string>(
          "SELECT token_budget FROM agents WHERE session_id = ?",
        )
        .get("agent-a");

      expect(tokenBudgetBefore?.token_budget, invalidCase.name).toBeNull();
      expect(tokenBudgetAfter?.token_budget, invalidCase.name).toBeNull();
    }
  });

  test("rejects invalid kill payloads with 400 before not_found or DB writes", async () => {
    const invalidCases = [
      {
        name: "missing session_id",
        body: {},
        error: "session_id must be a non-empty string",
      },
      {
        name: "session_id wrong type",
        body: { session_id: 42 },
        error: "session_id must be a non-empty string",
      },
      {
        name: "session_id whitespace-only",
        body: { session_id: "  " },
        error: "session_id must be a non-empty string",
      },
    ] as const;

    for (const invalidCase of invalidCases) {
      const db = createTestDb();
      seedAgent(db, "agent-a");
      const fetchDaemon = createDaemonFetch(db, () => {}, {
        authToken: TEST_TOKEN,
      });

      const statusBefore = db
        .query<{ status: string }, string>(
          "SELECT status FROM agents WHERE session_id = ?",
        )
        .get("agent-a");

      const res = expectResponse(
        await fetchDaemon(jsonRequest("/kill", invalidCase.body, TEST_TOKEN)),
      );
      expect(res.status, invalidCase.name).toBe(400);
      expect(await res.json()).toEqual({
        ok: false,
        error: invalidCase.error,
      });

      const statusAfter = db
        .query<{ status: string }, string>(
          "SELECT status FROM agents WHERE session_id = ?",
        )
        .get("agent-a");

      expect(statusBefore?.status, invalidCase.name).toBe("running");
      expect(statusAfter?.status, invalidCase.name).toBe("running");
    }
  });

  test("rejects injection messages larger than 64 KB UTF-8 bytes with 400", async () => {
    const db = createTestDb();
    seedAgent(db, "big");
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: TEST_TOKEN,
    });

    const oversizedMessage = "a".repeat(70_000);
    const req = jsonRequest(
      "/inject",
      { session_id: "big", message: oversizedMessage },
      TEST_TOKEN,
    );

    const res = expectResponse(await fetchDaemon(req));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toMatch(/injection message.*64/i);
  });

  test("accepts injection message up to 64 KB", async () => {
    const db = createTestDb();
    seedAgent(db, "ok");
    const fetchDaemon = createDaemonFetch(db, () => {}, {
      authToken: TEST_TOKEN,
    });

    const message = "a".repeat(64 * 1024);
    const req = jsonRequest(
      "/inject",
      { session_id: "ok", message },
      TEST_TOKEN,
    );

    const res = expectResponse(await fetchDaemon(req));
    expect(res.status).toBe(200);
  });
});
