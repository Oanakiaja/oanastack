import type { HarnessId } from "./types.js";

export class HarnessNotImplementedError extends Error {
  readonly harness: HarnessId;
  readonly methodName: string;

  constructor(harness: HarnessId, methodName: string) {
    super(
      `${harness} harness is not implemented yet (${methodName}). Only the Codex harness is available in this release.`,
    );
    this.name = "HarnessNotImplementedError";
    this.harness = harness;
    this.methodName = methodName;
  }
}

export class UnknownHarnessError extends Error {
  readonly harness: string;

  constructor(harness: string) {
    super(
      `Unknown harness "${harness}". Expected one of: codex, cursor-cli, claude-code, kimi.`,
    );
    this.name = "UnknownHarnessError";
    this.harness = harness;
  }
}

export class SessionNotFoundError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
    this.sessionId = sessionId;
  }
}

export class ProtocolError extends Error {
  readonly code?: number;
  readonly data?: unknown;

  constructor(message: string, options?: { code?: number; data?: unknown }) {
    super(message);
    this.name = "ProtocolError";
    this.code = options?.code;
    this.data = options?.data;
  }
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}
