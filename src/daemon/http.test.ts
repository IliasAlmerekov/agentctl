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

async function jsonRequest(path: string, body: unknown): Promise<Request> {
  return new Request(`http://agentctl.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
    const fetchDaemon = createDaemonFetch(db, (event) => events.push(event));

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
        }),
      ),
    );
    const capResponse = expectResponse(
      await fetchDaemon(
        await jsonRequest("/cap", { session_id: "agent-a", tokens: 50 }),
      ),
    );
    const killResponse = expectResponse(
      await fetchDaemon(
        await jsonRequest("/kill", { session_id: "agent-b" }),
      ),
    );
    const agentsResponse = expectResponse(
      await fetchDaemon(new Request("http://agentctl.test/agents")),
    );
    const statusResponse = expectResponse(
      await fetchDaemon(new Request("http://agentctl.test/status")),
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
});
