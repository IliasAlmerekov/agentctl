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
