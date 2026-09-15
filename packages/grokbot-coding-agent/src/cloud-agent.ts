import type { AgentStatus, ApprovalDecision, ApprovalPolicy, HarnessId, SandboxMode } from "./types.js";
import { SESSION_URL_SCHEME } from "./version.js";

export const CLOUD_AGENT_ACTIONS = [
  "launch",
  "reply",
  "get",
  "list",
  "watch",
  "dump",
  "cancel",
  "archive",
  "unarchive",
  "rename",
  "delete",
  "models",
  "list_artifacts",
  "approve",
] as const;

export type CloudAgentAction = (typeof CLOUD_AGENT_ACTIONS)[number];

export type CloudAgentScope = "launched" | "all";

export interface CloudAgentRequest {
  action: CloudAgentAction;
  prompt?: string;
  cwd?: string;
  repo_url?: string;
  starting_ref?: string;
  model?: string;
  model_params?: Record<string, string>;
  title?: string;
  sandbox?: SandboxMode;
  approvalPolicy?: ApprovalPolicy;
  harness?: HarnessId;
  interrupt?: boolean;
  agent_id?: string;
  sessionId?: string;
  scope?: CloudAgentScope;
  include_archived?: boolean;
  limit?: number;
  path?: string;
  confirm?: boolean;
  requestId?: string;
  decision?: ApprovalDecision;
}

export interface LastTurnInfo {
  text?: string;
  status?: AgentStatus;
  error?: string;
  turnId?: string;
}

export interface CloudAgentHandle {
  id: string;
  agent_id: string;
  sessionId: string;
  url: string;
}

export interface CloudAgentSummary extends CloudAgentHandle {
  name: string;
  status: AgentStatus;
  isArchived: boolean;
  cwd?: string;
  branchName?: string;
  harness: HarnessId;
  createdAt?: string;
  updatedAt?: string;
  preview?: string;
  waitingOnApproval?: boolean;
}

export interface PendingApproval {
  id: string;
  kind: string;
  summary: string;
  threadId?: string;
  turnId?: string;
  method?: string;
  payload: unknown;
  createdAt: string;
}

export interface CloudAgentDetail extends CloudAgentSummary {
  lastTurn?: LastTurnInfo;
  error?: string;
  lastPrompt?: string;
  pendingApprovals?: PendingApproval[];
  waitingOnApproval?: boolean;
}

export interface ApproveResult {
  agent_id: string;
  sessionId: string;
  requestId: string;
  decision: ApprovalDecision;
  pendingApprovals: PendingApproval[];
  waitingOnApproval: boolean;
}

export interface LaunchResult extends CloudAgentHandle {
  status: AgentStatus;
}

export interface ReplyResult extends CloudAgentHandle {
  runId: string;
  interrupted: boolean;
  wasRunning: boolean;
  queued: boolean;
  status: AgentStatus;
}

export interface DumpResult {
  agent_id: string;
  sessionId: string;
  path: string;
  status: AgentStatus;
  lineCount: number;
  sizeBytes: number;
}

export interface ArtifactInfo {
  path: string;
  sizeBytes: number;
}

export interface ModelInfo {
  id: string;
  displayName?: string;
  aliases: string[];
  params: { id: string; values: { value: string }[] }[];
}

export type CloudAgentResult =
  | { action: "launch"; data: LaunchResult }
  | { action: "reply"; data: ReplyResult }
  | { action: "get"; data: CloudAgentDetail }
  | { action: "list"; data: CloudAgentSummary[] }
  | { action: "watch"; data: CloudAgentDetail }
  | { action: "dump"; data: DumpResult }
  | { action: "cancel"; data: CloudAgentDetail }
  | { action: "archive"; data: CloudAgentDetail }
  | { action: "unarchive"; data: CloudAgentDetail }
  | { action: "rename"; data: CloudAgentDetail }
  | { action: "delete"; data: { agent_id: string; deleted: true } }
  | { action: "models"; data: ModelInfo[] }
  | { action: "list_artifacts"; data: ArtifactInfo[] }
  | { action: "approve"; data: ApproveResult };

export function isCloudAgentAction(value: string): value is CloudAgentAction {
  return (CLOUD_AGENT_ACTIONS as readonly string[]).includes(value);
}

export function resolveAgentId(request: Pick<CloudAgentRequest, "agent_id" | "sessionId">): string | undefined {
  return request.agent_id ?? request.sessionId;
}

export function sessionUrl(sessionId: string): string {
  return `${SESSION_URL_SCHEME}://${sessionId}`;
}
