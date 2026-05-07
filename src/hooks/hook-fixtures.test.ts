import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import {
  parseHookInput,
  validatePostToolUseInput,
  validatePreToolUseInput,
  validateSubagentEventInput,
} from "./hook-input.ts";

type HookFixture = {
  name: string;
  path: string;
  validate: (value: unknown) => unknown | null;
};

const FIXTURES: HookFixture[] = [
  {
    name: "PreToolUse",
    path: "docs/hook-fixtures/pre-tool-use.json",
    validate: validatePreToolUseInput,
  },
  {
    name: "PostToolUse",
    path: "docs/hook-fixtures/post-tool-use.json",
    validate: validatePostToolUseInput,
  },
  {
    name: "SubagentStart",
    path: "docs/hook-fixtures/subagent-start.json",
    validate: validateSubagentEventInput,
  },
  {
    name: "SubagentStop",
    path: "docs/hook-fixtures/subagent-stop.json",
    validate: validateSubagentEventInput,
  },
];

describe("manual hook fixtures", () => {
  for (const fixture of FIXTURES) {
    test(`${fixture.name} fixture is accepted by hook validation`, () => {
      const raw = readFileSync(fixture.path, "utf8");

      expect(parseHookInput(raw, fixture.validate)).not.toBeNull();
    });
  }
});
