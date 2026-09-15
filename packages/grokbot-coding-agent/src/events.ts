import type { HarnessId, NormalizedItem, TurnStatus } from "./types.js";

export type SessionEventType =
  | "session.started"
  | "turn.started"
  | "turn.completed"
  | "item.started"
  | "item.updated"
  | "item.completed"
  | "approval.needed";

export interface SessionStartedEvent {
  type: "session.started";
  sessionId: string;
  harness: HarnessId;
}

export interface TurnStartedEvent {
  type: "turn.started";
  sessionId: string;
  turnId?: string;
}

export interface TurnCompletedEvent {
  type: "turn.completed";
  sessionId: string;
  turnId?: string;
  status: TurnStatus;
  text?: string;
  error?: string;
}

export interface ItemStartedEvent {
  type: "item.started";
  sessionId: string;
  item: NormalizedItem;
}

export interface ItemUpdatedEvent {
  type: "item.updated";
  sessionId: string;
  item: NormalizedItem;
}

export interface ItemCompletedEvent {
  type: "item.completed";
  sessionId: string;
  item: NormalizedItem;
}

export interface ApprovalNeededEvent {
  type: "approval.needed";
  sessionId: string;
  requestId: string;
  kind: string;
  summary: string;
  threadId?: string;
  turnId?: string;
  method?: string;
  payload: unknown;
}

export type SessionEvent =
  | SessionStartedEvent
  | TurnStartedEvent
  | TurnCompletedEvent
  | ItemStartedEvent
  | ItemUpdatedEvent
  | ItemCompletedEvent
  | ApprovalNeededEvent;

export type SessionEventHandler = (event: SessionEvent) => void;

export function itemText(item: unknown): string | undefined {
  if (!item || typeof item !== "object") {
    return undefined;
  }
  const record = item as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }
  if (Array.isArray(record.content)) {
    const parts = record.content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join("");
    }
  }
  return undefined;
}

export function normalizeItem(raw: unknown): NormalizedItem {
  if (!raw || typeof raw !== "object") {
    return { type: "unknown", raw };
  }
  const record = raw as Record<string, unknown>;
  return {
    id: typeof record.id === "string" ? record.id : undefined,
    type: typeof record.type === "string" ? record.type : "unknown",
    text: itemText(raw),
    status: typeof record.status === "string" ? record.status : undefined,
    raw,
  };
}

export function extractAgentText(items: Iterable<unknown>): string {
  const texts: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "";
    if (type === "agentMessage" || type === "agent_message") {
      const text = itemText(item);
      if (text) {
        texts.push(text);
      }
    }
  }
  return texts.join("\n");
}

export function asTurnStatus(value: unknown): TurnStatus {
  if (value === "completed" || value === "interrupted" || value === "failed" || value === "inProgress") {
    return value;
  }
  return "completed";
}
