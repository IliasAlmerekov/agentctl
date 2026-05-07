import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startDaemon } from "./startup.ts";

function tempHome(): string {
  return join(tmpdir(), `agentctl-daemon-startup-${crypto.randomUUID()}`);
}

describe("daemon startup errors", () => {
  test("reports a clear recovery path when the auth token is missing", () => {
    const home = tempHome();

    expect(() =>
      startDaemon({
        home,
        serve: (() => {
          throw new Error("serve should not be reached without a token");
        }) as typeof Bun.serve,
      }),
    ).toThrow(
      `agentctl daemon cannot start: missing auth token at ${home}/.agentctl/auth-token. Re-run install.sh to generate it.`,
    );
  });

  test("reports a clear recovery path when the auth token is empty", () => {
    const home = tempHome();
    mkdirSync(join(home, ".agentctl"), { recursive: true });
    writeFileSync(join(home, ".agentctl", "auth-token"), "\n");

    expect(() =>
      startDaemon({
        home,
        serve: (() => {
          throw new Error("serve should not be reached with an empty token");
        }) as typeof Bun.serve,
      }),
    ).toThrow(
      `agentctl daemon cannot start: auth token at ${home}/.agentctl/auth-token is empty. Re-run install.sh or replace it with a non-empty token.`,
    );
  });

  test("reports a clear recovery path when the daemon port is already in use", () => {
    const home = tempHome();
    mkdirSync(join(home, ".agentctl"), { recursive: true });
    writeFileSync(join(home, ".agentctl", "auth-token"), "token\n");

    expect(() =>
      startDaemon({
        home,
        serve: (() => {
          throw Object.assign(new Error("Failed to start server"), {
            code: "EADDRINUSE",
          });
        }) as typeof Bun.serve,
      }),
    ).toThrow(
      "agentctl daemon cannot start: 127.0.0.1:47823 is already in use. Stop the existing agentctl-daemon or free the port, then restart.",
    );
  });
});
