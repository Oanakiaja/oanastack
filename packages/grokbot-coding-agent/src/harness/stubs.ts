import { HarnessNotImplementedError } from "../errors.js";
import type { HarnessId, ListOpts, ResumeOpts, SessionSummary, StartOpts } from "../types.js";
import type { CodingAgentHarness, HarnessSession } from "./types.js";

class StubHarness implements CodingAgentHarness {
  constructor(readonly id: HarnessId) {}

  async connect(): Promise<void> {
    throw new HarnessNotImplementedError(this.id, "connect");
  }

  async disconnect(): Promise<void> {
    throw new HarnessNotImplementedError(this.id, "disconnect");
  }

  async startSession(_opts: StartOpts): Promise<HarnessSession> {
    throw new HarnessNotImplementedError(this.id, "startSession");
  }

  async resumeSession(_id: string, _opts?: ResumeOpts): Promise<HarnessSession> {
    throw new HarnessNotImplementedError(this.id, "resumeSession");
  }

  async listSessions(_opts?: ListOpts): Promise<SessionSummary[]> {
    throw new HarnessNotImplementedError(this.id, "listSessions");
  }
}

export class CursorCliHarness extends StubHarness {
  constructor() {
    super("cursor-cli");
  }
}

export class ClaudeCodeHarness extends StubHarness {
  constructor() {
    super("claude-code");
  }
}

export class KimiHarness extends StubHarness {
  constructor() {
    super("kimi");
  }
}
