import { describe, expect, test } from "bun:test";
import { statusSymbol } from "./agents.ts";

describe("statusSymbol", () => {
  test("renders stale sessions distinctly from cleanly completed sessions", () => {
    expect(statusSymbol("stale")).toBe("!");
  });
});
