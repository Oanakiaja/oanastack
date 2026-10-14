import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./db.js";
import { dedupeKey, eventHash, isForwardStatus } from "./normalize.js";
import type {
  AgentCursor,
  AgentKind,
  AgentStatus,
  DeliveryState,
  ForwardStatus,
  IngestResult,
  StoredEvent,
  TriggerEvent,
} from "./types.js";

interface AgentRow {
  agent: string;
  kind: string | null;
  generation: number;
  last_status: string | null;
  last_forwarded_status: string | null;
  last_forwarded_hash: string | null;
  cwd: string | null;
  worktree: string | null;
  branch: string | null;
  updated_at: string;
}

interface EventRow {
  id: number;
  dedupe_key: string;
  agent: string;
  kind: string;
  status: string;
  summary: string | null;
  text: string | null;
  cwd: string | null;
  worktree: string | null;
  branch: string | null;
  ts: string;
  state: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
  created_at: string;
  delivered_at: string | null;
}

export class TriggerStore {
  readonly path: string;
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.path = dbPath;
    this.db = openDatabase(dbPath);
  }

  close(): void {
    this.db.close();
  }

  ingest(event: TriggerEvent, now: Date = new Date()): IngestResult {
    const hash = eventHash(event.summary, event.text);
    const nowIso = now.toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existingAgent = this.agentRow(event.agent);
      const generation = nextGeneration(existingAgent, event.status);
      this.upsertAgent(event, generation, nowIso, isForwardStatus(event.status) ? hash : existingAgent?.last_forwarded_hash ?? null);
      if (!isForwardStatus(event.status)) {
        this.db.exec("COMMIT");
        return { id: null, duplicate: false, state: "skipped", forward: false };
      }
      const key = dedupeKey(event.agent, event.kind, event.status, hash, generation);
      const prior = this.eventByKey(key);
      if (prior) {
        this.db.exec("COMMIT");
        return { id: prior.id, duplicate: true, state: prior.state as DeliveryState, forward: false };
      }
      const inserted = this.db
        .prepare(
          `INSERT INTO events (
            dedupe_key, agent, kind, status, summary, text, cwd, worktree, branch, ts, state, attempts, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
        )
        .run(
          key,
          event.agent,
          event.kind,
          event.status,
          event.summary,
          event.text,
          event.cwd,
          event.worktree,
          event.branch,
          event.ts,
          nowIso,
        );
      this.db.exec("COMMIT");
      return { id: Number(inserted.lastInsertRowid), duplicate: false, state: "pending", forward: true };
    } catch (error) {
      this.rollback();
      if (isUnique(error)) {
        return { id: null, duplicate: true, state: "pending", forward: false };
      }
      throw error;
    }
  }

  getEvent(id: number): StoredEvent | null {
    const row = this.db.prepare("SELECT * FROM events WHERE id = ?").get(id) as EventRow | undefined;
    return row ? toEvent(row) : null;
  }

  listDue(nowIso: string): StoredEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM events
         WHERE state = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY id`,
      )
      .all(nowIso) as unknown as EventRow[];
    return rows.map(toEvent);
  }

  markSent(id: number, at: string): void {
    this.db
      .prepare(
        `UPDATE events SET state = 'sent', attempts = attempts + 1, last_error = NULL, next_attempt_at = NULL, delivered_at = ? WHERE id = ?`,
      )
      .run(at, id);
  }

  markRetry(id: number, error: string, nextAt: string): void {
    this.db
      .prepare(
        `UPDATE events SET state = 'pending', attempts = attempts + 1, last_error = ?, next_attempt_at = ? WHERE id = ?`,
      )
      .run(error, nextAt, id);
  }

  markFailed(id: number, error: string): void {
    this.db
      .prepare(
        `UPDATE events SET state = 'failed', attempts = attempts + 1, last_error = ?, next_attempt_at = NULL WHERE id = ?`,
      )
      .run(error, id);
  }

  /** Keep a pending event queued without burning a delivery attempt. */
  defer(id: number, error: string, nextAt: string): void {
    this.db
      .prepare(`UPDATE events SET last_error = ?, next_attempt_at = ? WHERE id = ? AND state = 'pending'`)
      .run(error, nextAt, id);
  }

  recordAttempt(eventId: number, attempt: number, at: string, ok: boolean, statusCode: number, error: string | null): void {
    this.db
      .prepare(
        `INSERT INTO delivery_log (event_id, attempt, at, ok, status_code, error) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(eventId, attempt, at, ok ? 1 : 0, statusCode, error);
  }

  counts(): Record<DeliveryState, number> {
    const counts: Record<DeliveryState, number> = { pending: 0, sent: 0, failed: 0, skipped: 0 };
    const rows = this.db.prepare("SELECT state, COUNT(*) AS n FROM events GROUP BY state").all() as Array<{
      state: DeliveryState;
      n: number;
    }>;
    for (const row of rows) counts[row.state] = row.n;
    return counts;
  }

  recordSession(input: {
    agent: string;
    kind: AgentKind | null;
    branch: string | null;
    cwd: string | null;
    worktree: string | null;
    now?: Date;
  }): void {
    const nowIso = (input.now ?? new Date()).toISOString();
    this.db
      .prepare(
        `INSERT INTO agents (agent, kind, generation, last_status, last_forwarded_status, last_forwarded_hash, cwd, worktree, branch, updated_at)
         VALUES (?, ?, 0, NULL, NULL, NULL, ?, ?, ?, ?)
         ON CONFLICT(agent) DO UPDATE SET
           kind = COALESCE(excluded.kind, agents.kind),
           cwd = COALESCE(excluded.cwd, agents.cwd),
           worktree = COALESCE(excluded.worktree, agents.worktree),
           branch = COALESCE(excluded.branch, agents.branch),
           updated_at = excluded.updated_at`,
      )
      .run(input.agent, input.kind, input.cwd, input.worktree, input.branch, nowIso);
  }

  listAgents(): AgentCursor[] {
    const rows = this.db.prepare("SELECT * FROM agents ORDER BY agent").all() as unknown as AgentRow[];
    return rows.map(toCursor);
  }

  lastDelivery(): {
    at: string;
    ok: boolean;
    agent: string;
    status: string;
    attempt: number;
    error: string | null;
  } | null {
    const row = this.db
      .prepare(
        `SELECT l.at AS at, l.ok AS ok, l.attempt AS attempt, l.error AS error, e.agent AS agent, e.status AS status
         FROM delivery_log l JOIN events e ON e.id = l.event_id
         ORDER BY l.id DESC LIMIT 1`,
      )
      .get() as
      | { at: string; ok: number; attempt: number; error: string | null; agent: string; status: string }
      | undefined;
    if (!row) return null;
    return {
      at: row.at,
      ok: row.ok === 1,
      agent: row.agent,
      status: row.status,
      attempt: row.attempt,
      error: row.error,
    };
  }

  private agentRow(agent: string): AgentRow | undefined {
    return this.db.prepare("SELECT * FROM agents WHERE agent = ?").get(agent) as AgentRow | undefined;
  }

  private eventByKey(key: string): EventRow | undefined {
    return this.db.prepare("SELECT * FROM events WHERE dedupe_key = ?").get(key) as EventRow | undefined;
  }

  private upsertAgent(event: TriggerEvent, generation: number, nowIso: string, forwardedHash: string | null): void {
    const forwarded = isForwardStatus(event.status) ? event.status : null;
    this.db
      .prepare(
        `INSERT INTO agents (agent, kind, generation, last_status, last_forwarded_status, last_forwarded_hash, cwd, worktree, branch, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(agent) DO UPDATE SET
           kind = excluded.kind,
           generation = excluded.generation,
           last_status = excluded.last_status,
           last_forwarded_status = COALESCE(excluded.last_forwarded_status, agents.last_forwarded_status),
           last_forwarded_hash = COALESCE(excluded.last_forwarded_hash, agents.last_forwarded_hash),
           cwd = COALESCE(excluded.cwd, agents.cwd),
           worktree = COALESCE(excluded.worktree, agents.worktree),
           branch = COALESCE(excluded.branch, agents.branch),
           updated_at = excluded.updated_at`,
      )
      .run(
        event.agent,
        event.kind,
        generation,
        event.status,
        forwarded,
        forwarded ? forwardedHash : null,
        event.cwd,
        event.worktree,
        event.branch ?? null,
        nowIso,
      );
  }

  private rollback(): void {
    try {
      this.db.exec("ROLLBACK");
    } catch {
      // already rolled back
    }
  }
}

function nextGeneration(row: AgentRow | undefined, status: AgentStatus): number {
  const previous = row?.generation ?? 0;
  const wasTerminal = row?.last_status === "done" || row?.last_status === "blocked";
  if (!isForwardStatus(status) && wasTerminal) return previous + 1;
  return previous;
}

function toEvent(row: EventRow): StoredEvent {
  return {
    id: row.id,
    dedupeKey: row.dedupe_key,
    agent: row.agent,
    kind: row.kind as AgentKind,
    status: row.status as AgentStatus,
    summary: row.summary,
    text: row.text,
    cwd: row.cwd,
    worktree: row.worktree,
    branch: row.branch,
    ts: row.ts,
    state: row.state as DeliveryState,
    attempts: row.attempts,
    lastError: row.last_error,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
  };
}

function toCursor(row: AgentRow): AgentCursor {
  return {
    agent: row.agent,
    kind: row.kind === "codex" || row.kind === "claude" ? row.kind : null,
    generation: row.generation,
    lastStatus: (row.last_status as AgentStatus | null) ?? null,
    lastForwardedStatus: (row.last_forwarded_status as ForwardStatus | null) ?? null,
    cwd: row.cwd,
    worktree: row.worktree,
    branch: row.branch,
    updatedAt: row.updated_at,
  };
}

function isUnique(error: unknown): boolean {
  return error instanceof Error && /UNIQUE/i.test(error.message);
}
