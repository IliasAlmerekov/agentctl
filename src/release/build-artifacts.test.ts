import { describe, expect, test } from "bun:test";
import {
  RELEASE_BINARIES,
  RELEASE_PLATFORMS,
  getReleaseArtifacts,
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
});
