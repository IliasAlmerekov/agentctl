import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { AUTH_HEADER } from "../auth.ts";
import { DAEMON_HOST, DAEMON_PORT } from "../config.ts";

function expectFileToContain(path: string, requiredText: string[]): void {
  const contents = readFileSync(path, "utf8");

  for (const text of requiredText) {
    expect(contents, `${path} should contain ${text}`).toContain(text);
  }
}

describe("local daemon auth beta gate", () => {
  test("wires one local token through install, daemon, CLI, hooks, and TUI", () => {
    expectFileToContain("install.sh", [
      'AUTH_TOKEN_FILE="$AGENTCTL_HOME/auth-token"',
      "generate_auth_token",
      'chmod 600 "$AUTH_TOKEN_FILE"',
    ]);
    expectFileToContain("src/daemon/startup.ts", [
      "readAuthToken(home)",
      "createDaemonFetch(db, broadcast, { authToken })",
    ]);
    expectFileToContain("src/daemon/http.ts", [
      "CLI_ENDPOINTS",
      "HOOK_ENDPOINTS",
      "hasAuthHeader(req, authToken)",
      "hasAuthQueryToken(req, authToken)",
    ]);
    expectFileToContain("src/cli/api.ts", [
      "readAuthToken()",
      "authHeaders(token)",
      "daemonWsUrlWithToken(readAuthToken())",
    ]);
    expectFileToContain("src/hooks/daemon-client.ts", [
      "options.readToken ?? readAuthToken",
      "...authHeaders(token)",
    ]);
  });

  test("documents the local auth flow and same-user limits", () => {
    expectFileToContain("docs/security.md", [
      "## Auth flow",
      "single-user local control plane",
      `${DAEMON_HOST}:${DAEMON_PORT}`,
      "`~/.agentctl/auth-token`",
      AUTH_HEADER,
      "CLI requests and hook requests send the token",
      "TUI WebSocket sends the same token",
      "mode `0600`",
      "same user",
      "not a sandbox",
    ]);
    expectFileToContain("README.md", [
      "Local security model",
      "`~/.agentctl/auth-token`",
      "docs/security.md",
    ]);
    expectFileToContain("AGENTCTL.md", [
      "`~/.agentctl/auth-token`",
      "docs/security.md",
    ]);
  });
});
