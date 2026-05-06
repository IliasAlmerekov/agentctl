import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

const INSTALL_SCRIPT = readFileSync("install.sh", "utf8");

describe("install.sh checksum verification", () => {
  test("downloads the published checksum manifest", () => {
    expect(INSTALL_SCRIPT).toContain('CHECKSUMS_FILE="$AGENTCTL_HOME/SHA256SUMS"');
    expect(INSTALL_SCRIPT).toContain(
      'curl -fsSL "$BASE_URL/SHA256SUMS" -o "$CHECKSUMS_FILE"',
    );
  });

  test("verifies every downloaded artifact for the selected platform", () => {
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "agentctl-$PLATFORM" "$BIN_DIR/agentctl"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "agentctl-daemon-$PLATFORM" "$BIN_DIR/agentctl-daemon"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "pre-tool-use-$PLATFORM" "$HOOKS_DIR/pre-tool-use"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "post-tool-use-$PLATFORM" "$HOOKS_DIR/post-tool-use"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "subagent-start-$PLATFORM" "$HOOKS_DIR/subagent-start"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "subagent-stop-$PLATFORM" "$HOOKS_DIR/subagent-stop"',
    );
  });

  test("verifies checksums before marking downloaded files executable", () => {
    expect(INSTALL_SCRIPT.indexOf("verify_downloads")).toBeGreaterThan(-1);
    expect(INSTALL_SCRIPT.indexOf("verify_downloads")).toBeLessThan(
      INSTALL_SCRIPT.indexOf("chmod +x"),
    );
  });
});
