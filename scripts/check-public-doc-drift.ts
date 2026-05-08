import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const SCAN_ROOTS = [
  "README.md",
  "AGENTCTL.md",
  "CHANGELOG.md",
  "install.sh",
  "docs",
  ".github",
  "src",
];

const BLOCKED_PATTERNS = [
  /TODO/,
  /not implemented/i,
  /placeholder/i,
  /your-org/i,
  /OWNER\/REPO/,
];

function shouldScanFile(path: string): boolean {
  if (path.endsWith(".test.ts")) return false;
  if (path.includes("/hook-fixtures/")) return false;
  if (path.includes("/superpowers/")) return false;
  return /\.(md|sh|ts|tsx|yml|yaml|json)$/.test(path);
}

function listFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return shouldScanFile(path) ? [path] : [];

  return readdirSync(path)
    .filter((entry) => !entry.startsWith(".git"))
    .flatMap((entry) => listFiles(join(path, entry)));
}

const findings = SCAN_ROOTS.flatMap((root) => listFiles(root)).flatMap((path) => {
  const content = readFileSync(path, "utf8");
  return BLOCKED_PATTERNS.flatMap((pattern) => {
    const lines = content.split("\n");
    return lines.flatMap((line, index) =>
      pattern.test(line) ? [`${path}:${index + 1}: ${line.trim()}`] : [],
    );
  });
});

if (findings.length > 0) {
  console.error("Public docs drift check failed:");
  for (const finding of findings) console.error(finding);
  process.exit(1);
}

console.log("Public docs drift check passed");
