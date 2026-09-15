export const HARNESS_IDS = ["codex", "cursor-cli", "claude-code", "kimi"] as const;

export type HarnessId = (typeof HARNESS_IDS)[number];

export const SANDBOX_MODES = [
  "read-only",
  "workspace-write",
  "danger-full-access",
] as const;

export type SandboxMode = (typeof SANDBOX_MODES)[number];

export const APPROVAL_POLICIES = ["untrusted", "on-request", "never"] as const;

export type ApprovalPolicy = (typeof APPROVAL_POLICIES)[number];

export const AUTO_APPROVAL_DECISIONS = ["accept", "acceptForSession", "decline"] as const;

export type AutoApprovalDecision = (typeof AUTO_APPROVAL_DECISIONS)[number];

export const APPROVAL_DECISIONS = ["accept", "acceptForSession", "decline", "cancel"] as const;

export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const AGENT_STATUSES = ["creating", "running", "finished", "error", "cancelled"] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];

export type TurnStatus = "completed" | "interrupted" | "failed" | "inProgress";

export interface StartOpts {
  cwd: string;
  prompt?: string;
  sandbox?: SandboxMode;
  approvalPolicy?: ApprovalPolicy;
  model?: string;
}

export interface ResumeOpts {
  cwd?: string;
  sandbox?: SandboxMode;
  approvalPolicy?: ApprovalPolicy;
  model?: string;
}

export interface ListOpts {
  cwd?: string;
  cursor?: string;
}

export interface SessionSummary {
  sessionId: string;
  harness: HarnessId;
  cwd?: string;
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  preview?: string;
  lastPrompt?: string;
  status?: string;
}

export interface NormalizedItem {
  id?: string;
  type: string;
  text?: string;
  status?: string;
  raw: unknown;
}

export interface TurnResult {
  sessionId: string;
  text: string;
  status: TurnStatus;
  turnId?: string;
  items: NormalizedItem[];
  error?: string;
}

export interface CreateClientOptions {
  harness?: HarnessId | "fake" | import("./harness/types.js").CodingAgentHarness;
  stateDir?: string;
  cwd?: string;
  codex?: import("./harness/codex/options.js").CodexHarnessOptions;
  background?: "inline" | "detach";
  autoApprove?: boolean | AutoApprovalDecision;
  spawnWorker?: (request: {
    sessionId: string;
    stateDir: string;
    harness?: string;
    autoApprove?: boolean;
  }) => { pid?: number };
}

export function isHarnessId(value: string): value is HarnessId {
  return (HARNESS_IDS as readonly string[]).includes(value);
}

export function isSandboxMode(value: string): value is SandboxMode {
  return (SANDBOX_MODES as readonly string[]).includes(value);
}

export function isApprovalPolicy(value: string): value is ApprovalPolicy {
  return (APPROVAL_POLICIES as readonly string[]).includes(value);
}

export function isAgentStatus(value: string): value is AgentStatus {
  return (AGENT_STATUSES as readonly string[]).includes(value);
}

export function isApprovalDecision(value: string): value is ApprovalDecision {
  return (APPROVAL_DECISIONS as readonly string[]).includes(value);
}
