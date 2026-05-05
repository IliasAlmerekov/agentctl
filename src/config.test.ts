import { describe, expect, test } from "bun:test";
import {
  DAEMON_HOST,
  DAEMON_HTTP_ORIGIN,
  DAEMON_PORT,
  DAEMON_WS_ORIGIN,
  daemonListenOptions,
} from "./config.ts";

describe("daemon network config", () => {
  test("binds the daemon explicitly to IPv4 loopback", () => {
    expect(DAEMON_HOST).toBe("127.0.0.1");
    expect(DAEMON_PORT).toBe(47823);
    expect(DAEMON_HTTP_ORIGIN).toBe("http://127.0.0.1:47823");
    expect(DAEMON_WS_ORIGIN).toBe("ws://127.0.0.1:47823");
    expect(daemonListenOptions()).toEqual({
      hostname: "127.0.0.1",
      port: 47823,
    });
  });
});
