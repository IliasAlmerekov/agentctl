import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { AUTH_HEADER } from "../auth.ts";
import { DAEMON_HOST, DAEMON_PORT } from "../config.ts";

const SECURITY_DOC = "docs/security.md";

describe("local security note", () => {
  test("documents daemon access and limits", () => {
    const doc = readFileSync(SECURITY_DOC, "utf8");

    for (const requiredText of [
      "single-user local control plane",
      DAEMON_HOST,
      String(DAEMON_PORT),
      "`~/.agentctl/auth-token`",
      AUTH_HEADER,
      "CLI requests",
      "hook requests",
      "TUI WebSocket",
      "same user",
      "not a sandbox",
      "remote daemon is not supported",
      "fail open",
    ]) {
      expect(doc).toContain(requiredText);
    }
  });

  test("primary docs link the security note", () => {
    expect(readFileSync("README.md", "utf8")).toContain(SECURITY_DOC);
    expect(readFileSync("AGENTCTL.md", "utf8")).toContain(SECURITY_DOC);
  });
});
