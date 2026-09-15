import { UnknownHarnessError } from "../errors.js";
import type { HarnessId } from "../types.js";
import { isHarnessId } from "../types.js";
import { CodexHarness } from "./codex/harness.js";
import type { CodexHarnessOptions } from "./codex/options.js";
import { FakeHarness, type FakeHarnessOptions } from "./fake.js";
import { ClaudeCodeHarness, CursorCliHarness, KimiHarness } from "./stubs.js";
import type { CodingAgentHarness } from "./types.js";

export interface HarnessFactoryOptions {
  codex?: CodexHarnessOptions;
  fake?: FakeHarnessOptions;
  allowFake?: boolean;
}

export function getHarness(id: string, options: HarnessFactoryOptions = {}): CodingAgentHarness {
  if (id === "fake") {
    if (!options.allowFake && process.env.GROKBOT_CODING_AGENT_CLI_FAKE !== "1") {
      throw new UnknownHarnessError(id);
    }
    return new FakeHarness(options.fake);
  }
  if (!isHarnessId(id)) {
    throw new UnknownHarnessError(id);
  }
  return createHarness(id, options);
}

export function createHarness(id: HarnessId, options: HarnessFactoryOptions = {}): CodingAgentHarness {
  switch (id) {
    case "codex":
      return new CodexHarness(options.codex);
    case "cursor-cli":
      return new CursorCliHarness();
    case "claude-code":
      return new ClaudeCodeHarness();
    case "kimi":
      return new KimiHarness();
  }
}
