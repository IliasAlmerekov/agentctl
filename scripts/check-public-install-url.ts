import { readFileSync } from "fs";

const README_PATH = "README.md";
const EXPECTED_INSTALL_URL =
  "https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const readme = readFileSync(README_PATH, "utf8");
const urls = [
  ...readme.matchAll(
    /https:\/\/raw\.githubusercontent\.com\/IliasAlmerekov\/agentctl\/[^)\s`'"]+install\.sh/g,
  ),
].map((match) => match[0]);

if (!urls.includes(EXPECTED_INSTALL_URL)) {
  fail(
    `${README_PATH} must reference the public main install URL: ${EXPECTED_INSTALL_URL}`,
  );
}

const response = await fetch(EXPECTED_INSTALL_URL, { method: "HEAD" });

if (response.status !== 200) {
  fail(
    `Public install URL returned ${response.status}, expected 200: ${EXPECTED_INSTALL_URL}`,
  );
}

console.log(`Public install URL is reachable: ${EXPECTED_INSTALL_URL}`);
