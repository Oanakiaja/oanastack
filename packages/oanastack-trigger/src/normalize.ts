import { createHash } from "node:crypto";
import { TriggerError } from "./errors.js";
import { AGENT_KINDS, AGENT_STATUSES, type AgentKind, type AgentStatus, type TriggerEvent } from "./types.js";

const AGENT_NAME = /^[a-z][a-z0-9_-]{0,31}$/;
const PANE_ID = /^w\d+:p\d+$/;
const TEXT_LIMIT = 12_000;
const SUMMARY_LIMIT = 240;
const PATH_LIMIT = 1024;

export function normalizeEvent(input: unknown, now: Date = new Date()): TriggerEvent {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TriggerError("event must be a JSON object", "invalid");
  }
  const raw = input as Record<string, unknown>;
  const agent = requiredString(raw, "agent");
  if (!AGENT_NAME.test(agent) && !PANE_ID.test(agent)) {
    throw new TriggerError("agent must be a herdr name or pane id", "invalid");
  }
  const kind = requiredString(raw, "kind");
  if (!isKind(kind)) throw new TriggerError("kind must be codex or claude", "invalid");
  const status = requiredString(raw, "status").toLowerCase();
  if (!isStatus(status)) {
    throw new TriggerError("status must be idle, working, blocked, done, or unknown", "invalid");
  }
  const text = limit(optionalString(raw, "text"), TEXT_LIMIT);
  const summary = limit(optionalString(raw, "summary") ?? firstLine(text), SUMMARY_LIMIT);
  return {
    agent,
    kind,
    status,
    summary,
    text,
    cwd: limit(optionalString(raw, "cwd"), PATH_LIMIT),
    worktree: limit(optionalString(raw, "worktree"), PATH_LIMIT),
    ts: parseTs(optionalString(raw, "ts"), now),
  };
}

export function eventHash(summary: string | null, text: string | null): string {
  return createHash("sha256").update(`${summary ?? ""}\0${text ?? ""}`).digest("hex");
}

export function dedupeKey(agent: string, kind: string, status: string, hash: string, generation: number): string {
  return createHash("sha256").update(`${agent}|${kind}|${status}|${hash}|${generation}`).digest("hex");
}

export function isForwardStatus(status: string): status is "done" | "blocked" {
  return status === "done" || status === "blocked";
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

export function firstLine(text: string | null): string | null {
  if (!text) return null;
  for (const line of stripAnsi(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed.slice(0, SUMMARY_LIMIT);
  }
  return null;
}

export function publicBody(event: TriggerEvent): {
  agent: string;
  kind: AgentKind;
  status: AgentStatus;
  summary: string | null;
  text: string | null;
  cwd: string | null;
  worktree: string | null;
  ts: string;
} {
  return {
    agent: event.agent,
    kind: event.kind,
    status: event.status,
    summary: event.summary,
    text: event.text,
    cwd: event.cwd,
    worktree: event.worktree,
    ts: event.ts,
  };
}

function requiredString(raw: Record<string, unknown>, key: string): string {
  const value = optionalString(raw, key);
  if (!value) throw new TriggerError(`${key} is required`, "invalid");
  return value;
}

function optionalString(raw: Record<string, unknown>, key: string): string | null {
  if (!(key in raw) || raw[key] === null || raw[key] === undefined) return null;
  if (typeof raw[key] !== "string") throw new TriggerError(`${key} must be a string`, "invalid");
  const trimmed = raw[key].trim();
  return trimmed.length > 0 ? trimmed : null;
}

function limit(value: string | null, max: number): string | null {
  if (value === null) return null;
  return value.length > max ? value.slice(0, max) : value;
}

function parseTs(value: string | null, now: Date): string {
  if (!value) return now.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TriggerError("ts must be an ISO-8601 timestamp", "invalid");
  return parsed.toISOString();
}

function isKind(value: string): value is AgentKind {
  return (AGENT_KINDS as readonly string[]).includes(value);
}

function isStatus(value: string): value is AgentStatus {
  return (AGENT_STATUSES as readonly string[]).includes(value);
}
