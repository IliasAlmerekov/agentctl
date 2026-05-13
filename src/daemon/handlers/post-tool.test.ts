import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../db.ts";
import { handlePostTool } from "./post-tool.ts";
import type { AgentEvent, PostToolUseInput } from "../../types.ts";

function createTestDb(): Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

describe("handlePostTool", () => {
  test("creates an agent record and increments tokens for unknown sessions", () => {
    const db = createTestDb();
    const events: AgentEvent[] = [];
    const input: PostToolUseInput = {
      session_id: "new-session",
      tool_name: "Bash",
      tool_input: { command: "rtk ls" },
      tool_response: { ok: true },
      tokens_used: 12,
    };

    const result = handlePostTool(input, db, (event) => events.push(event));
    const row = db
      .query<
        { tokens_used: number; status: string; started_at: number | null },
        string
      >("SELECT tokens_used, status, started_at FROM agents WHERE session_id = ?")
      .get("new-session");

    expect(result).toEqual({ ok: true });
    expect(row?.tokens_used).toBe(12);
    expect(row?.status).toBe("running");
    expect(row?.started_at).toBeNumber();
    expect(events.some((event) => event.type === "agents_update")).toBe(true);
  });

  test("marks agents as budget_exceeded when token budget is reached", () => {
    const db = createTestDb();
    db.run(
      `INSERT INTO agents (session_id, status, tokens_used, token_budget, started_at)
       VALUES (?, 'running', ?, ?, ?)`,
      ["budget-session", 9, 10, Date.now()],
    );

    const result = handlePostTool(
      {
        session_id: "budget-session",
        tool_name: "Bash",
        tool_input: { command: "rtk ls" },
        tool_response: { ok: true },
        tokens_used: 1,
      },
      db,
      () => undefined,
    );
    const row = db
      .query<
        { status: string; ended_at: number | null; tokens_used: number },
        string
      >("SELECT status, ended_at, tokens_used FROM agents WHERE session_id = ?")
      .get("budget-session");

    expect(result).toEqual({ ok: true });
    expect(row?.tokens_used).toBe(10);
    expect(row?.status).toBe("budget_exceeded");
    expect(row?.ended_at).toBeNumber();
  });
});
