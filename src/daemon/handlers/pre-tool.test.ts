import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../db.ts";
import { handlePreTool } from "./pre-tool.ts";
import type { AgentEvent, PreToolUseInput } from "../../types.ts";

function createTestDb(): Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

describe("handlePreTool", () => {
  test("creates an agent record for unknown sessions", () => {
    const db = createTestDb();

    const decision = handlePreTool(
      {
        session_id: "new-session",
        tool_name: "Bash",
        tool_input: { command: "rtk ls" },
      },
      db,
    );
    const row = db
      .query<
        {
          session_id: string;
          status: string;
          depth: number;
          tokens_used: number;
          parent_id: string | null;
          started_at: number | null;
        },
        string
      >(
        "SELECT session_id, status, depth, tokens_used, parent_id, started_at FROM agents WHERE session_id = ?",
      )
      .get("new-session");

    expect(decision).toEqual({ block: false });
    expect(row?.session_id).toBe("new-session");
    expect(row?.status).toBe("running");
    expect(row?.depth).toBe(0);
    expect(row?.tokens_used).toBe(0);
    expect(row?.parent_id).toBeNull();
    expect(row?.started_at).toBeNumber();
  });

  test("records the current tool for allowed sessions and broadcasts agents_update", () => {
    const db = createTestDb();
    const events: AgentEvent[] = [];
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_runtime (
        session_id TEXT PRIMARY KEY,
        current_tool TEXT
      );
    `);
    db.run(
      `INSERT INTO agents (session_id, status, started_at)
       VALUES (?, 'running', ?)`,
      ["tool-session", Date.now()],
    );

    const decision = handlePreTool(
      {
        session_id: "tool-session",
        tool_name: "Bash",
        tool_input: { command: "rtk ls" },
      },
      db,
      (event) => events.push(event),
    );
    const runtime = db
      .query<{ current_tool: string | null }, string>(
        "SELECT current_tool FROM agent_runtime WHERE session_id = ?",
      )
      .get("tool-session");
    const agentsUpdate = events.find((event) => event.type === "agents_update");

    expect(decision).toEqual({ block: false });
    expect(runtime?.current_tool).toBe("Bash");
    expect(agentsUpdate).toEqual({
      type: "agents_update",
      agents: [expect.objectContaining({ session_id: "tool-session", current_tool: "Bash" })],
    });
  });

  test("blocks a killed agent before allowing another tool call", () => {
    const db = createTestDb();
    db.run(
      `INSERT INTO agents (session_id, status, started_at, ended_at)
       VALUES (?, 'killed', ?, ?)`,
      ["killed-session", Date.now() - 1_000, Date.now()],
    );
    const input: PreToolUseInput = {
      session_id: "killed-session",
      tool_name: "Bash",
      tool_input: { command: "rtk ls" },
    };

    const decision = handlePreTool(input, db);

    expect(decision.block).toBe(true);
    expect(decision.reason).toContain("Agent killed-session has been killed");
  });

  test("blocks killed agents before delivering pending injections", () => {
    const db = createTestDb();
    db.run(
      `INSERT INTO agents (session_id, status, started_at, ended_at)
       VALUES (?, 'killed', ?, ?)`,
      ["killed-session", Date.now() - 1_000, Date.now()],
    );
    db.run(
      `INSERT INTO injections (session_id, message, status, created_at)
       VALUES (?, ?, 'pending', ?)`,
      ["killed-session", "change direction", Date.now()],
    );

    const decision = handlePreTool(
      {
        session_id: "killed-session",
        tool_name: "Bash",
        tool_input: { command: "rtk ls" },
      },
      db,
    );
    const injection = db
      .query<{ status: string }, []>("SELECT status FROM injections LIMIT 1")
      .get();

    expect(decision.block).toBe(true);
    expect(decision.reason).toContain("has been killed");
    expect(injection?.status).toBe("pending");
  });

  test("keeps killed-agent blocking scoped to the killed session", () => {
    const db = createTestDb();
    db.run(
      `INSERT INTO agents (session_id, status, started_at, ended_at)
       VALUES (?, 'killed', ?, ?)`,
      ["killed-session", Date.now() - 1_000, Date.now()],
    );
    db.run(
      `INSERT INTO agents (session_id, status, started_at)
       VALUES (?, 'running', ?)`,
      ["running-session", Date.now()],
    );

    const killedDecision = handlePreTool(
      {
        session_id: "killed-session",
        tool_name: "Bash",
        tool_input: { command: "rtk ls" },
      },
      db,
    );
    const runningDecision = handlePreTool(
      {
        session_id: "running-session",
        tool_name: "Bash",
        tool_input: { command: "rtk ls" },
      },
      db,
    );

    expect(killedDecision.block).toBe(true);
    expect(runningDecision).toEqual({ block: false });
  });

  test("allows tool calls while token usage is below the budget cap", () => {
    const db = createTestDb();
    db.run(
      `INSERT INTO agents (session_id, status, tokens_used, token_budget, started_at)
       VALUES (?, 'running', ?, ?, ?)`,
      ["budget-session", 99, 100, Date.now()],
    );

    const decision = handlePreTool(
      {
        session_id: "budget-session",
        tool_name: "Bash",
        tool_input: { command: "rtk test" },
      },
      db,
    );
    const calls = db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM tool_calls")
      .get();

    expect(decision).toEqual({ block: false });
    expect(calls?.count).toBe(1);
  });

  test("blocks tool calls when token usage reaches the budget cap", () => {
    const db = createTestDb();
    db.run(
      `INSERT INTO agents (session_id, status, tokens_used, token_budget, started_at)
       VALUES (?, 'running', ?, ?, ?)`,
      ["budget-session", 100, 100, Date.now()],
    );

    const decision = handlePreTool(
      {
        session_id: "budget-session",
        tool_name: "Bash",
        tool_input: { command: "rtk test" },
      },
      db,
    );
    const calls = db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM tool_calls")
      .get();

    expect(decision.block).toBe(true);
    expect(decision.reason).toContain("Token budget exceeded");
    expect(decision.reason).toContain("100 / 100 tokens");
    expect(calls?.count).toBe(0);
  });

  test("delivers a pending injection as a blocking steering signal", () => {
    const db = createTestDb();
    db.run(
      `INSERT INTO agents (session_id, status, started_at)
       VALUES (?, 'running', ?)`,
      ["injected-session", Date.now()],
    );
    db.run(
      `INSERT INTO injections (session_id, message, status, created_at)
       VALUES (?, ?, 'pending', ?)`,
      ["injected-session", "use the smaller fix", Date.now()],
    );

    const decision = handlePreTool(
      {
        session_id: "injected-session",
        tool_name: "Bash",
        tool_input: { command: "rtk test" },
      },
      db,
    );
    const injection = db
      .query<
        { status: string; delivered_at: number | null },
        []
      >("SELECT status, delivered_at FROM injections LIMIT 1")
      .get();

    expect(decision.block).toBe(true);
    expect(decision.reason).toContain("STEERING SIGNAL");
    expect(decision.reason).toContain("use the smaller fix");
    expect(injection?.status).toBe("delivered");
    expect(injection?.delivered_at).toBeNumber();
  });

  test("does not deliver the same injection more than once", () => {
    const db = createTestDb();
    db.run(
      `INSERT INTO agents (session_id, status, started_at)
       VALUES (?, 'running', ?)`,
      ["injected-session", Date.now()],
    );
    db.run(
      `INSERT INTO injections (session_id, message, status, created_at)
       VALUES (?, ?, 'pending', ?)`,
      ["injected-session", "only once", Date.now()],
    );
    const input: PreToolUseInput = {
      session_id: "injected-session",
      tool_name: "Bash",
      tool_input: { command: "rtk test" },
    };

    const firstDecision = handlePreTool(input, db);
    const secondDecision = handlePreTool(input, db);
    const delivered = db
      .query<
        { count: number },
        []
      >("SELECT COUNT(*) as count FROM injections WHERE status = 'delivered'")
      .get();

    expect(firstDecision.block).toBe(true);
    expect(firstDecision.reason).toContain("only once");
    expect(secondDecision).toEqual({ block: false });
    expect(delivered?.count).toBe(1);
  });

  test("broadcasts loop_detected when repeated tool input is blocked", () => {
    const db = createTestDb();
    const input: PreToolUseInput = {
      session_id: "loop-session",
      tool_name: "Bash",
      tool_input: {
        command: "rtk rg TODO .",
        timestamp: "ignored-by-normaliser",
      },
    };
    const events: AgentEvent[] = [];

    for (let i = 0; i < 4; i += 1) {
      expect(handlePreTool(input, db, (event) => events.push(event))).toEqual({
        block: false,
      });
    }

    const decision = handlePreTool(input, db, (event) => events.push(event));
    const calls = db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM tool_calls")
      .get();

    expect(decision.block).toBe(true);
    const event = events.find((item) => item.type === "loop_detected");
    expect(event?.session_id).toBe("loop-session");
    expect(event?.message).toContain("Bash");
    expect(event?.message).toContain("5");
    expect(calls?.count).toBe(4);
  });

  test("stores cwd when creating an agent via pre-tool hook", () => {
    const db = createTestDb();

    handlePreTool(
      {
        session_id: "cwd-session",
        tool_name: "Bash",
        tool_input: { command: "ls" },
        cwd: "/home/user/my-project",
      },
      db,
    );

    const row = db
      .query<{ cwd: string | null }, string>(
        "SELECT cwd FROM agents WHERE session_id = ?",
      )
      .get("cwd-session");
    expect(row?.cwd).toBe("/home/user/my-project");
  });
});
