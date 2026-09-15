import type { ApprovalDecision, ListOpts, ResumeOpts, SessionSummary, StartOpts, TurnResult } from "../types.js";
import type { SessionEvent, SessionEventHandler } from "../events.js";
import type { HarnessId } from "../types.js";

export interface HarnessSession {
  readonly sessionId: string;
  readonly threadId?: string;
  turn(prompt: string): Promise<TurnResult>;
  steer(prompt: string): Promise<void>;
  interrupt(): Promise<void>;
  on(handler: SessionEventHandler): () => void;
}

export interface CodingAgentHarness {
  readonly id: HarnessId;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  startSession(opts: StartOpts): Promise<HarnessSession>;
  resumeSession(id: string, opts?: ResumeOpts): Promise<HarnessSession>;
  listSessions(opts?: ListOpts): Promise<SessionSummary[]>;
  respondApproval?(requestId: string, decision: ApprovalDecision): boolean;
}

export type { SessionEvent, SessionEventHandler };
