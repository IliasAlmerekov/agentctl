import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

const OUT_OF_SCOPE_DOC = "docs/out-of-scope.md";

describe("MVP out-of-scope documentation", () => {
  test("keeps beta exclusions explicit", () => {
    const doc = readFileSync(OUT_OF_SCOPE_DOC, "utf8");

    for (const requiredText of [
      "Windows",
      "remote daemon",
      "Web UI",
      "per-tool-type budgets",
      "external observability",
      "OpenTelemetry",
      "Grafana",
      "inject",
      "cap",
      "kill",
    ]) {
      expect(doc).toContain(requiredText);
    }
  });

  test("primary docs link the out-of-scope list", () => {
    expect(readFileSync("README.md", "utf8")).toContain(OUT_OF_SCOPE_DOC);
    expect(readFileSync("AGENTCTL.md", "utf8")).toContain(OUT_OF_SCOPE_DOC);
  });
});
