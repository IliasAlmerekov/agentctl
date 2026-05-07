import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  CHECKSUMS_FILE_NAME,
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

  test("emits one downloadable archive for every platform", () => {
    const artifacts = getReleaseArtifacts();

    expect(artifacts).toHaveLength(RELEASE_PLATFORMS.length);
    expect(artifacts.map((artifact) => artifact.outfile)).toEqual([
      "dist/agentctl-darwin-arm64.tar.gz",
      "dist/agentctl-darwin-x64.tar.gz",
      "dist/agentctl-linux-x64.tar.gz",
    ]);
    expect(
      artifacts
        .filter((artifact) => artifact.platform.name === "linux-x64")
        .map((artifact) => artifact.outfile),
    ).toEqual(["dist/agentctl-linux-x64.tar.gz"]);
  });

  test("uses Bun compile targets for each supported platform", () => {
    expect(RELEASE_PLATFORMS.map((platform) => platform.bunTarget)).toEqual([
      "bun-darwin-arm64",
      "bun-darwin-x64",
      "bun-linux-x64",
    ]);
  });

  test("bundles Ink's optional devtools peer for CLI release builds", async () => {
    const releaseModule = await import("./build-artifacts.ts");
    const getReleaseCompiledBinaries =
      "getReleaseCompiledBinaries" in releaseModule
        ? releaseModule.getReleaseCompiledBinaries
        : undefined;

    expect(typeof getReleaseCompiledBinaries).toBe("function");

    const cliArtifacts = (getReleaseCompiledBinaries?.() ?? []).filter((artifact) => {
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
    const first = join(dir, "agentctl-linux-x64.tar.gz");
    const second = join(dir, "agentctl-darwin-arm64.tar.gz");
    const checksumFile = join(dir, CHECKSUMS_FILE_NAME);
    writeFileSync(first, "first artifact");
    writeFileSync(second, "second artifact");

    const artifacts = [
      { outfile: first },
      { outfile: second },
    ] as ReleaseArtifact[];

    const checksums = writeChecksumManifest(artifacts, checksumFile);

    expect(checksums.map((checksum) => checksum.fileName)).toEqual([
      "agentctl-linux-x64.tar.gz",
      "agentctl-darwin-arm64.tar.gz",
    ]);
    expect(readFileSync(checksumFile, "utf8")).toBe(
      [
        "69f6245a92f0c902e45cfd6e99297cad3e536598237b6ef3d04fbb59c8a3b095  agentctl-linux-x64.tar.gz",
        "60c48ddce35530a43716c40331da2e737fca5f9b2468c01396726ab7d4f351b2  agentctl-darwin-arm64.tar.gz",
        "",
      ].join("\n"),
    );
  });
});
