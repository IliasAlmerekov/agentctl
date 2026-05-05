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

    for (let i = 0; i < 5; i += 1) {
      expect(handlePreTool(input, db, (event) => events.push(event))).toEqual({
        block: false,
      });
    }

    const decision = handlePreTool(input, db, (event) => events.push(event));

    expect(decision.block).toBe(true);
    const event = events.find((item) => item.type === "loop_detected");
    expect(event?.session_id).toBe("loop-session");
    expect(event?.message).toContain("Bash");
    expect(event?.message).toContain("5");
  });
});
