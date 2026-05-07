import { describe, expect, test } from "bun:test";
import { formatCapSet } from "./cap.ts";

describe("formatCapSet", () => {
  test("formats token budget confirmations with a short session label", () => {
    expect(formatCapSet("budget-session", 50)).toBe(
      "✓ Token budget set to 50 for agent budget-s",
    );
  });
});
