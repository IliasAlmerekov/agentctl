import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startDaemon } from "./startup.ts";

const noopServe = ((opts: { hostname: string; port: number }) => ({
  stop() {},
  port: opts.port,
  hostname: opts.hostname,
})) as unknown as typeof Bun.serve;

const noopInterval = ((..._args: unknown[]) => 0) as unknown as typeof setInterval;
const silentLogger = { log: () => {} };

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

  test("reports a clear recovery path when the schema is from a newer daemon", () => {
    const home = tempHome();
    mkdirSync(join(home, ".agentctl"), { recursive: true });
    writeFileSync(join(home, ".agentctl", "auth-token"), "token\n");

    const dbPath = join(home, ".agentctl", "agents.db");
    const seed = new Database(dbPath, { create: true });
    seed.exec(`
      CREATE TABLE schema_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    seed.run(
      "INSERT INTO schema_metadata (key, value, updated_at) VALUES ('schema_version', '999', 0)",
    );
    seed.close();

    expect(() =>
      startDaemon({
        home,
        serve: noopServe,
        setIntervalFn: noopInterval,
        logger: silentLogger,
      }),
    ).toThrow(/schema version 999.*supports schema version 2.*move .* aside/s);
  });

  test("creates a fresh database when one does not exist", () => {
    const home = tempHome();
    mkdirSync(join(home, ".agentctl"), { recursive: true });
    writeFileSync(join(home, ".agentctl", "auth-token"), "token\n");

    const runtime = startDaemon({
      home,
      serve: noopServe,
      setIntervalFn: noopInterval,
      logger: silentLogger,
    });

    expect(existsSync(join(home, ".agentctl", "agents.db"))).toBe(true);
    expect(runtime.db).toBeDefined();
    runtime.db.close();
  });

  test("startup logs do not include the auth token", () => {
    const home = tempHome();
    mkdirSync(join(home, ".agentctl"), { recursive: true });
    const secret = "very-secret-test-token-12345";
    writeFileSync(join(home, ".agentctl", "auth-token"), `${secret}\n`);

    const captured: string[] = [];
    const recordingLogger = {
      log: (...args: unknown[]) => captured.push(args.map(String).join(" ")),
    };

    const runtime = startDaemon({
      home,
      serve: noopServe,
      setIntervalFn: noopInterval,
      logger: recordingLogger,
    });

    for (const line of captured) {
      expect(line).not.toContain(secret);
      expect(line).not.toContain("token=");
    }
    runtime.db.close();
  });
});
