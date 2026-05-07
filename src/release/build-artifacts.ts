import { createHash } from "crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { basename, dirname } from "path";

export const CHECKSUMS_FILE_NAME = "SHA256SUMS";
const RELEASE_STAGING_DIR = "dist/.release";

export type ReleasePlatform = {
  name: "darwin-arm64" | "darwin-x64" | "linux-x64";
  bunTarget: "bun-darwin-arm64" | "bun-darwin-x64" | "bun-linux-x64";
};

export type ReleaseBinary = {
  archivePath: string;
  name: string;
  entrypoint: string;
  defines?: string[];
  externals?: string[];
};

export type ReleaseCompiledBinary = {
  binary: ReleaseBinary;
  platform: ReleasePlatform;
  outfile: string;
  args: string[];
};

export type ReleaseArtifact = {
  platform: ReleasePlatform;
  outfile: string;
};

export type ReleaseChecksum = {
  outfile: string;
  fileName: string;
  sha256: string;
  line: string;
};

export const RELEASE_PLATFORMS: ReleasePlatform[] = [
  { name: "darwin-arm64", bunTarget: "bun-darwin-arm64" },
  { name: "darwin-x64", bunTarget: "bun-darwin-x64" },
  { name: "linux-x64", bunTarget: "bun-linux-x64" },
];

export const RELEASE_BINARIES: ReleaseBinary[] = [
  {
    archivePath: "agentctl",
    name: "agentctl",
    entrypoint: "src/cli/index.ts",
    defines: ['process.env.DEV=""'],
  },
  {
    archivePath: "agentctl-daemon",
    name: "agentctl-daemon",
    entrypoint: "src/daemon/server.ts",
  },
  {
    archivePath: "hooks/pre-tool-use",
    name: "pre-tool-use",
    entrypoint: "src/hooks/pre-tool-use.ts",
  },
  {
    archivePath: "hooks/post-tool-use",
    name: "post-tool-use",
    entrypoint: "src/hooks/post-tool-use.ts",
  },
  {
    archivePath: "hooks/subagent-start",
    name: "subagent-start",
    entrypoint: "src/hooks/subagent-start.ts",
  },
  {
    archivePath: "hooks/subagent-stop",
    name: "subagent-stop",
    entrypoint: "src/hooks/subagent-stop.ts",
  },
];

export function getReleaseArtifacts(): ReleaseArtifact[] {
  return RELEASE_PLATFORMS.map((platform) => {
    return {
      platform,
      outfile: `dist/agentctl-${platform.name}.tar.gz`,
    };
  });
}

export function getReleaseCompiledBinaries(
  stagingDir = RELEASE_STAGING_DIR,
): ReleaseCompiledBinary[] {
  return RELEASE_PLATFORMS.flatMap((platform) =>
    RELEASE_BINARIES.map((binary) => {
      const outfile = `${stagingDir}/${platform.name}/${binary.archivePath}`;
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

      for (const external of binary.externals ?? []) {
        args.push("--external", external);
      }

      return { binary, platform, outfile, args };
    }),
  );
}

export function buildReleaseArtifacts(): void {
  rmSync("dist", { recursive: true, force: true });
  mkdirSync("dist", { recursive: true });
  const binaries = getReleaseCompiledBinaries();

  for (const artifact of binaries) {
    mkdirSync(dirname(artifact.outfile), { recursive: true });
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

  const artifacts = getReleaseArtifacts();
  for (const artifact of artifacts) {
    const stagingDir = `${RELEASE_STAGING_DIR}/${artifact.platform.name}`;
    const result = Bun.spawnSync({
      cmd: ["tar", "-czf", artifact.outfile, "-C", stagingDir, "."],
      stdout: "inherit",
      stderr: "inherit",
    });

    if (!result.success) {
      throw new Error(
        `Failed to archive ${artifact.platform.name} (exit ${result.exitCode})`,
      );
    }
  }

  writeChecksumManifest(artifacts);
  rmSync(RELEASE_STAGING_DIR, { recursive: true, force: true });
}

export function writeChecksumManifest(
  artifacts: ReleaseArtifact[] = getReleaseArtifacts(),
  outfile = `dist/${CHECKSUMS_FILE_NAME}`,
): ReleaseChecksum[] {
  const checksums = artifacts.map((artifact) => {
    const fileName = basename(artifact.outfile);
    const sha256 = createHash("sha256")
      .update(readFileSync(artifact.outfile))
      .digest("hex");
    return {
      outfile: artifact.outfile,
      fileName,
      sha256,
      line: `${sha256}  ${fileName}`,
    };
  });

  writeFileSync(outfile, `${checksums.map((item) => item.line).join("\n")}\n`);
  return checksums;
}

if (import.meta.main) {
  buildReleaseArtifacts();
}
