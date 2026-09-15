import {
  asTurnStatus,
  extractAgentText,
  normalizeItem,
  type SessionEvent,
} from "../../events.js";
import type { NormalizedItem, TurnStatus } from "../../types.js";
import type { JsonlNotification } from "./jsonl.js";

export interface CodexTurnSnapshot {
  turnId?: string;
  status: TurnStatus;
  items: NormalizedItem[];
  text: string;
  error?: string;
}

export function emptyTurnSnapshot(): CodexTurnSnapshot {
  return { status: "inProgress", items: [], text: "" };
}

function recordFrom(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function turnFromParams(params: unknown): { turn?: Record<string, unknown>; threadId?: string } {
  const record = recordFrom(params);
  if (!record) {
    return {};
  }
  return {
    turn: recordFrom(record.turn),
    threadId: typeof record.threadId === "string" ? record.threadId : undefined,
  };
}

export function applyNotification(
  sessionId: string,
  snapshot: CodexTurnSnapshot,
  notification: JsonlNotification,
): { event?: SessionEvent; snapshot: CodexTurnSnapshot } {
  const { method, params } = notification;
  if (method === "turn/started") {
    const { turn } = turnFromParams(params);
    const turnId = typeof turn?.id === "string" ? turn.id : snapshot.turnId;
    const next = { ...snapshot, turnId, status: "inProgress" as const };
    return {
      snapshot: next,
      event: { type: "turn.started", sessionId, turnId },
    };
  }
  if (method === "turn/completed") {
    const { turn } = turnFromParams(params);
    const items = Array.isArray(turn?.items) ? turn.items.map(normalizeItem) : snapshot.items;
    const status = asTurnStatus(turn?.status);
    const error =
      turn?.error && typeof turn.error === "object"
        ? String((turn.error as { message?: unknown }).message ?? "turn failed")
        : undefined;
    const text = extractAgentText(items.map((item) => item.raw)) || snapshot.text;
    const turnId = typeof turn?.id === "string" ? turn.id : snapshot.turnId;
    const next: CodexTurnSnapshot = { turnId, status, items, text, error };
    return {
      snapshot: next,
      event: { type: "turn.completed", sessionId, turnId, status, text, error },
    };
  }
  if (method === "item/started") {
    const item = normalizeItem(recordFrom(params)?.item ?? params);
    const items = upsertItem(snapshot.items, item);
    return {
      snapshot: { ...snapshot, items, text: extractAgentText(items.map((entry) => entry.raw)) || snapshot.text },
      event: { type: "item.started", sessionId, item },
    };
  }
  if (method === "item/completed") {
    const item = normalizeItem(recordFrom(params)?.item ?? params);
    const items = upsertItem(snapshot.items, item);
    return {
      snapshot: { ...snapshot, items, text: extractAgentText(items.map((entry) => entry.raw)) || snapshot.text },
      event: { type: "item.completed", sessionId, item },
    };
  }
  if (method.startsWith("item/") && (method.endsWith("/delta") || method.endsWith("/updated"))) {
    const item = normalizeItem(recordFrom(params)?.item ?? params);
    const items = upsertItem(snapshot.items, item);
    return {
      snapshot: { ...snapshot, items },
      event: { type: "item.updated", sessionId, item },
    };
  }
  return { snapshot };
}

function upsertItem(items: NormalizedItem[], item: NormalizedItem): NormalizedItem[] {
  if (!item.id) {
    return [...items, item];
  }
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index === -1) {
    return [...items, item];
  }
  const next = [...items];
  next[index] = item;
  return next;
}
