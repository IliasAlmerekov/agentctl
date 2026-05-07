import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  CHECKSUMS_FILE_NAME,
  RELEASE_BINARIES,
  RELEASE_PLATFORMS,
  getReleaseArtifacts,
  writeChecksumManifest,
  type ReleaseArtifact,
} from "./build-artifacts.ts";

describe("release artifact manifest", () => {
  test("covers every supported installer platform", () => {
    expect(RELEASE_PLATFORMS.map((platform) => platform.name)).toEqual([
      "darwin-arm64",
      "darwin-x64",
      "linux-x64",
    ]);
  });

  test("emits every installer artifact for every platform", () => {
    const artifacts = getReleaseArtifacts();

    expect(artifacts).toHaveLength(
      RELEASE_BINARIES.length * RELEASE_PLATFORMS.length,
    );
    expect(
      artifacts
        .filter((artifact) => artifact.platform.name === "linux-x64")
        .map((artifact) => artifact.outfile),
    ).toEqual([
      "dist/agentctl-linux-x64",
      "dist/agentctl-daemon-linux-x64",
      "dist/pre-tool-use-linux-x64",
      "dist/post-tool-use-linux-x64",
      "dist/subagent-start-linux-x64",
      "dist/subagent-stop-linux-x64",
    ]);
  });

  test("uses Bun compile targets for each supported platform", () => {
    expect(RELEASE_PLATFORMS.map((platform) => platform.bunTarget)).toEqual([
      "bun-darwin-arm64",
      "bun-darwin-x64",
      "bun-linux-x64",
    ]);
  });

  test("bundles Ink's optional devtools peer for CLI release builds", () => {
    const cliArtifacts = getReleaseArtifacts().filter((artifact) => {
      return artifact.binary.name === "agentctl";
    });

    expect(cliArtifacts).toHaveLength(RELEASE_PLATFORMS.length);
    for (const artifact of cliArtifacts) {
      expect(artifact.args).not.toContain("--external");
      expect(artifact.args).not.toContain("react-devtools-core");
    }
  });
});

describe("release checksum manifest", () => {
  test("writes SHA-256 checksums for release artifact file names", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentctl-release-"));
    const first = join(dir, "agentctl-linux-x64");
    const second = join(dir, "agentctl-daemon-linux-x64");
    const checksumFile = join(dir, CHECKSUMS_FILE_NAME);
    writeFileSync(first, "first artifact");
    writeFileSync(second, "second artifact");

    const artifacts = [
      { outfile: first },
      { outfile: second },
    ] as ReleaseArtifact[];

    const checksums = writeChecksumManifest(artifacts, checksumFile);

    expect(checksums.map((checksum) => checksum.fileName)).toEqual([
      "agentctl-linux-x64",
      "agentctl-daemon-linux-x64",
    ]);
    expect(readFileSync(checksumFile, "utf8")).toBe(
      [
        "69f6245a92f0c902e45cfd6e99297cad3e536598237b6ef3d04fbb59c8a3b095  agentctl-linux-x64",
        "60c48ddce35530a43716c40331da2e737fca5f9b2468c01396726ab7d4f351b2  agentctl-daemon-linux-x64",
        "",
      ].join("\n"),
    );
  });
});
