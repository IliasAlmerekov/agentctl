import { describe, expect, test } from "bun:test";
import { formatInjectQueued } from "./inject.ts";

describe("formatInjectQueued", () => {
  test("formats queued steering signals with a short session label", () => {
    expect(formatInjectQueued("injected-session")).toBe(
      "✓ Steering signal queued for agent injected",
    );
  });
});
