export const AGENT_KINDS = ["codex", "claude"] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export const AGENT_STATUSES = ["idle", "working", "blocked", "done", "unknown"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const FORWARD_STATUSES = ["done", "blocked"] as const;
export type ForwardStatus = (typeof FORWARD_STATUSES)[number];

export type DeliveryState = "pending" | "sent" | "failed" | "skipped";

export interface TriggerEvent {
  agent: string;
  kind: AgentKind;
  status: AgentStatus;
  summary: string | null;
  text: string | null;
  cwd: string | null;
  worktree: string | null;
  branch: string | null;
  ts: string;
}

export interface StoredEvent extends TriggerEvent {
  id: number;
  dedupeKey: string;
  state: DeliveryState;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface AgentCursor {
  agent: string;
  kind: AgentKind | null;
  generation: number;
  lastStatus: AgentStatus | null;
  lastForwardedStatus: ForwardStatus | null;
  cwd: string | null;
  worktree: string | null;
  branch: string | null;
  updatedAt: string;
}

export interface IngestResult {
  id: number | null;
  duplicate: boolean;
  state: DeliveryState;
  forward: boolean;
}

export interface HerdrSnapshot {
  name: string | null;
  kind: AgentKind | null;
  status: AgentStatus | null;
  cwd: string | null;
  worktree: string | null;
  paneId: string | null;
  revision: number | null;
}

export interface StatusSnapshot {
  service: { up: boolean; url: string | null };
  db: string;
  log: string;
  counts: Record<DeliveryState, number>;
  webhook: { configured: boolean; source: string | null };
  agents: AgentCursor[];
  lastDelivery: {
    at: string;
    ok: boolean;
    agent: string;
    status: string;
    attempt: number;
    error: string | null;
  } | null;
}
