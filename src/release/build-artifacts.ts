import { mkdirSync } from "fs";

export type ReleasePlatform = {
  name: "darwin-arm64" | "darwin-x64" | "linux-x64";
  bunTarget: "bun-darwin-arm64" | "bun-darwin-x64" | "bun-linux-x64";
};

export type ReleaseBinary = {
  name: string;
  entrypoint: string;
  defines?: string[];
};

export type ReleaseArtifact = {
  binary: ReleaseBinary;
  platform: ReleasePlatform;
  outfile: string;
  args: string[];
};

export const RELEASE_PLATFORMS: ReleasePlatform[] = [
  { name: "darwin-arm64", bunTarget: "bun-darwin-arm64" },
  { name: "darwin-x64", bunTarget: "bun-darwin-x64" },
  { name: "linux-x64", bunTarget: "bun-linux-x64" },
];

export const RELEASE_BINARIES: ReleaseBinary[] = [
  {
    name: "agentctl",
    entrypoint: "src/cli/index.ts",
    defines: ['process.env.DEV=""'],
  },
  { name: "agentctl-daemon", entrypoint: "src/daemon/server.ts" },
  { name: "pre-tool-use", entrypoint: "src/hooks/pre-tool-use.ts" },
  { name: "post-tool-use", entrypoint: "src/hooks/post-tool-use.ts" },
  { name: "subagent-start", entrypoint: "src/hooks/subagent-start.ts" },
  { name: "subagent-stop", entrypoint: "src/hooks/subagent-stop.ts" },
];

export function getReleaseArtifacts(): ReleaseArtifact[] {
  return RELEASE_PLATFORMS.flatMap((platform) =>
    RELEASE_BINARIES.map((binary) => {
      const outfile = `dist/${binary.name}-${platform.name}`;
      const args = [
        "build",
        "--compile",
        `--target=${platform.bunTarget}`,
        binary.entrypoint,
        `--outfile=${outfile}`,
      ];

      for (const define of binary.defines ?? []) {
        args.push("--define", define);
      }

      return { binary, platform, outfile, args };
    }),
  );
}

export function buildReleaseArtifacts(): void {
  mkdirSync("dist", { recursive: true });

  for (const artifact of getReleaseArtifacts()) {
    const result = Bun.spawnSync({
      cmd: [process.execPath, ...artifact.args],
      stdout: "inherit",
      stderr: "inherit",
    });

    if (!result.success) {
      const label = `${artifact.binary.name}-${artifact.platform.name}`;
      throw new Error(`Failed to build ${label} (exit ${result.exitCode})`);
    }
  }
}

if (import.meta.main) {
  buildReleaseArtifacts();
}
