import { describe, expect, test } from "bun:test";
import { authHeaders, daemonWsUrlWithToken } from "./api.ts";

describe("CLI auth helpers", () => {
  test("builds the daemon auth header from a token", () => {
    expect(authHeaders("test-token")).toEqual({
      "X-Agentctl-Token": "test-token",
    });
  });

  test("adds the auth token to websocket URLs", () => {
    expect(daemonWsUrlWithToken("test-token")).toBe(
      "ws://127.0.0.1:47823?token=test-token",
    );
  });

  test("URL-encodes websocket auth tokens", () => {
    expect(daemonWsUrlWithToken("token with spaces")).toBe(
      "ws://127.0.0.1:47823?token=token+with+spaces",
    );
  });
});
