import { open, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { AgentStatus, ApprovalDecision, ApprovalPolicy, HarnessId, SandboxMode } from "./types.js";
import { sessionUrl, type CloudAgentDetail, type CloudAgentSummary, type PendingApproval } from "./cloud-agent.js";
import { isPidAlive } from "./pid.js";
import { DEFAULT_STATE_DIR_NAME } from "./version.js";

export interface StoredSession {
  sessionId: string;
  harness: HarnessId;
  threadId?: string;
  cwd?: string;
  sandbox?: SandboxMode;
  approvalPolicy?: ApprovalPolicy;
  model?: string;
  title?: string;
  preview?: string;
  lastPrompt?: string;
  lastText?: string;
  lastTurnId?: string;
  status: AgentStatus;
  isArchived: boolean;
  launched: boolean;
  createdAt: string;
  updatedAt: string;
  error?: string;
  workerPid?: number;
  queuedPrompts?: string[];
  pendingApprovals?: PendingApproval[];
}

interface StateFile {
  sessions: StoredSession[];
}

export function defaultStateDir(): string {
  return path.join(homedir(), DEFAULT_STATE_DIR_NAME);
}

export class SessionStore {
  private writeLock: Promise<void> = Promise.resolve();

  constructor(readonly stateDir: string) {}

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.writeLock;
    this.writeLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const lockPath = `${this.sessionsPath}.lock`;
    await mkdir(this.stateDir, { recursive: true });
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      for (let attempt = 0; attempt < 200; attempt++) {
        try {
          handle = await open(lockPath, "wx");
          await handle.writeFile(`${process.pid}\n`);
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
          }
          try {
            const owner = Number((await readFile(lockPath, "utf8")).trim());
            if (!isPidAlive(owner)) {
              await rm(lockPath, { force: true });
              continue;
            }
          } catch {
            // lock file vanished or is unreadable; retry
          }
          await sleep(10);
        }
      }
      if (!handle) {
        throw new Error(`Timed out acquiring state lock at ${lockPath}`);
      }
      return await fn();
    } finally {
      if (handle) {
        await handle.close().catch(() => undefined);
        await rm(lockPath, { force: true });
      }
      release();
    }
  }

  get sessionsPath(): string {
    return path.join(this.stateDir, "sessions.json");
  }

  sessionDir(sessionId: string): string {
    return path.join(this.stateDir, "sessions", sessionId);
  }

  transcriptPath(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "transcript.jsonl");
  }

  cancelFlagPath(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "cancel");
  }

  interruptFlagPath(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "interrupt");
  }

  async hasCancelFlag(sessionId: string): Promise<boolean> {
    return pathExists(this.cancelFlagPath(sessionId));
  }

  async hasInterruptFlag(sessionId: string): Promise<boolean> {
    return pathExists(this.interruptFlagPath(sessionId));
  }

  async clearInterruptFlag(sessionId: string): Promise<void> {
    await rm(this.interruptFlagPath(sessionId), { force: true });
  }

  async list(): Promise<StoredSession[]> {
    const state = await this.read();
    return [...state.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(sessionId: string): Promise<StoredSession | undefined> {
    return this.lookup(sessionId, await this.readUnlocked());
  }

  async upsert(session: StoredSession): Promise<StoredSession> {
    return this.withLock(async () => {
      const state = await this.readUnlocked();
      const index = state.sessions.findIndex((entry) => entry.sessionId === session.sessionId);
      if (index === -1) {
        state.sessions.push(session);
      } else {
        state.sessions[index] = session;
      }
      await this.writeUnlocked(state);
      await mkdir(this.sessionDir(session.sessionId), { recursive: true });
      return session;
    });
  }

  async patch(sessionId: string, update: Partial<StoredSession>): Promise<StoredSession> {
    return this.withLock(async () => {
      const existing = this.lookup(sessionId, await this.readUnlocked());
      if (!existing) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      const next: StoredSession = {
        ...existing,
        ...update,
        sessionId: existing.sessionId,
        updatedAt: update.updatedAt ?? new Date().toISOString(),
      };
      const state = await this.readUnlocked();
      const index = state.sessions.findIndex((entry) => entry.sessionId === next.sessionId);
      if (index === -1) {
        state.sessions.push(next);
      } else {
        state.sessions[index] = next;
      }
      await this.writeUnlocked(state);
      return next;
    });
  }

  async remove(sessionId: string): Promise<boolean> {
    return this.withLock(async () => {
      const state = await this.readUnlocked();
      const next = state.sessions.filter(
        (session) => session.sessionId !== sessionId && session.threadId !== sessionId,
      );
      if (next.length === state.sessions.length) {
        return false;
      }
      await this.writeUnlocked({ sessions: next });
      return true;
    });
  }

  toSummary(session: StoredSession): CloudAgentSummary {
    return {
      id: session.sessionId,
      agent_id: session.sessionId,
      sessionId: session.sessionId,
      url: sessionUrl(session.sessionId),
      name: session.title ?? session.preview ?? session.lastPrompt ?? "",
      status: session.status,
      isArchived: session.isArchived,
      cwd: session.cwd,
      branchName: session.cwd,
      harness: session.harness,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      preview: session.preview ?? session.lastText,
      waitingOnApproval: (session.pendingApprovals?.length ?? 0) > 0,
    };
  }

  toDetail(session: StoredSession): CloudAgentDetail {
    const pendingApprovals = session.pendingApprovals ?? [];
    return {
      ...this.toSummary(session),
      lastTurn: session.lastText || session.lastTurnId || session.error
        ? {
            text: session.lastText,
            status: session.status,
            error: session.error,
            turnId: session.lastTurnId,
          }
        : undefined,
      error: session.error,
      lastPrompt: session.lastPrompt,
      pendingApprovals,
      waitingOnApproval: pendingApprovals.length > 0,
    };
  }

  approvalDecisionPath(sessionId: string, requestId: string): string {
    const safe = requestId.replace(/[^a-zA-Z0-9._-]+/g, "_");
    return path.join(this.sessionDir(sessionId), "approvals", `${safe}.json`);
  }

  async writeApprovalDecision(sessionId: string, requestId: string, decision: ApprovalDecision): Promise<void> {
    const file = this.approvalDecisionPath(sessionId, requestId);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify({ decision })}\n`, "utf8");
  }

  async readApprovalDecision(sessionId: string, requestId: string): Promise<ApprovalDecision | undefined> {
    try {
      const raw = await readFile(this.approvalDecisionPath(sessionId, requestId), "utf8");
      const parsed = JSON.parse(raw) as { decision?: string };
      if (
        parsed.decision === "accept" ||
        parsed.decision === "acceptForSession" ||
        parsed.decision === "decline" ||
        parsed.decision === "cancel"
      ) {
        return parsed.decision;
      }
      return undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async clearApprovalDecision(sessionId: string, requestId: string): Promise<void> {
    await rm(this.approvalDecisionPath(sessionId, requestId), { force: true });
  }

  private async read(): Promise<StateFile> {
    return this.readUnlocked();
  }

  private lookup(sessionId: string, state: StateFile): StoredSession | undefined {
    return (
      state.sessions.find((session) => session.sessionId === sessionId) ??
      state.sessions.find((session) => session.threadId === sessionId)
    );
  }

  private async readUnlocked(): Promise<StateFile> {
    try {
      const raw = await readFile(this.sessionsPath, "utf8");
      if (!raw.trim()) {
        return { sessions: [] };
      }
      const parsed = JSON.parse(raw) as StateFile;
      if (!parsed || !Array.isArray(parsed.sessions)) {
        return { sessions: [] };
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { sessions: [] };
      }
      throw error;
    }
  }

  private async writeUnlocked(state: StateFile): Promise<void> {
    await mkdir(this.stateDir, { recursive: true });
    const tmp = `${this.sessionsPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tmp, this.sessionsPath);
  }
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
