import { describe, expect, test } from "bun:test";
import { authHeaders, daemonWsUrl } from "./api.ts";
import { DAEMON_WS_ORIGIN } from "../config.ts";

describe("CLI auth helpers", () => {
  test("builds the daemon auth header from a token", () => {
    expect(authHeaders("test-token")).toEqual({
      "X-Agentctl-Token": "test-token",
    });
  });

  test("websocket URL contains no token", () => {
    expect(daemonWsUrl()).toBe(DAEMON_WS_ORIGIN);
    expect(daemonWsUrl()).not.toContain("token");
  });
});
