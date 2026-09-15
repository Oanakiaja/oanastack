import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  sessionUrl,
  resolveAgentId,
  type ApproveResult,
  type CloudAgentDetail,
  type CloudAgentRequest,
  type CloudAgentResult,
  type CloudAgentSummary,
  type DumpResult,
  type LaunchResult,
  type PendingApproval,
  type ReplyResult,
} from "./cloud-agent.js";
import { spawnDetachedWorker } from "./detach.js";
import { SessionNotFoundError, UsageError } from "./errors.js";
import type { ApprovalNeededEvent, SessionEvent, SessionEventHandler } from "./events.js";
import type { CodingAgentHarness, HarnessSession } from "./harness/types.js";
import { getHarness } from "./harness/registry.js";
import { isPidAlive } from "./pid.js";
import { defaultStateDir, SessionStore, type StoredSession } from "./state.js";
import { isActiveStatus, isTerminalStatus, turnStatusToAgentStatus } from "./status.js";
import { appendTranscript, writeTranscriptCopy } from "./transcript.js";
import type { ApprovalDecision, AutoApprovalDecision, CreateClientOptions, HarnessId } from "./types.js";

export interface CloudAgentClient {
  on(handler: SessionEventHandler): () => void;
  run(request: CloudAgentRequest): Promise<CloudAgentResult>;
  launch(request?: Omit<CloudAgentRequest, "action">): Promise<LaunchResult>;
  reply(request: Omit<CloudAgentRequest, "action">): Promise<ReplyResult>;
  get(request: Omit<CloudAgentRequest, "action"> | string): Promise<CloudAgentDetail>;
  list(request?: Omit<CloudAgentRequest, "action">): Promise<CloudAgentSummary[]>;
  watch(request: Omit<CloudAgentRequest, "action"> | string): Promise<CloudAgentDetail>;
  dump(request: Omit<CloudAgentRequest, "action"> | string): Promise<DumpResult>;
  cancel(request: Omit<CloudAgentRequest, "action"> | string): Promise<CloudAgentDetail>;
  archive(request: Omit<CloudAgentRequest, "action"> | string): Promise<CloudAgentDetail>;
  unarchive(request: Omit<CloudAgentRequest, "action"> | string): Promise<CloudAgentDetail>;
  rename(request: Omit<CloudAgentRequest, "action">): Promise<CloudAgentDetail>;
  delete(request: Omit<CloudAgentRequest, "action"> | string): Promise<{ agent_id: string; deleted: true }>;
  models(): Promise<CloudAgentResult>;
  listArtifacts(request: Omit<CloudAgentRequest, "action"> | string): Promise<CloudAgentResult>;
  approve(request: Omit<CloudAgentRequest, "action">): Promise<ApproveResult>;
  runWorker(sessionId: string): Promise<void>;
  close(options?: { drain?: boolean }): Promise<void>;
}

const CODEX_MODELS = [
  {
    id: "default",
    displayName: "Codex default (app-server configured model)",
    aliases: ["codex"],
    params: [
      {
        id: "sandbox",
        values: [
          { value: "read-only" },
          { value: "workspace-write" },
          { value: "danger-full-access" },
        ],
      },
    ],
  },
];

export function createClient(options: CreateClientOptions = {}): CloudAgentClient {
  return new CodingAgentClient(options);
}

class CodingAgentClient implements CloudAgentClient {
  private readonly store: SessionStore;
  private readonly harness: CodingAgentHarness;
  private readonly harnessId: HarnessId;
  private readonly live = new Map<string, HarnessSession>();
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly listeners = new Set<SessionEventHandler>();
  private readonly flagWatchers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly backgroundMode: "inline" | "detach";
  private readonly autoApprove: boolean;

  constructor(private readonly options: CreateClientOptions) {
    this.store = new SessionStore(options.stateDir ?? defaultStateDir());
    const autoApproval = resolveAutoApproval(options);
    this.autoApprove = Boolean(autoApproval);
    if (options.harness && typeof options.harness === "object") {
      this.harness = options.harness;
    } else {
      this.harness = getHarness(options.harness ?? "codex", {
        codex: { ...options.codex, autoApproval },
        allowFake: process.env.GROKBOT_CODING_AGENT_CLI_FAKE === "1" || options.harness === "fake",
      });
    }
    this.harnessId = this.harness.id;
    const requested = options.background ?? "inline";
    const canDetach = requested === "detach" && (typeof options.harness !== "object" || Boolean(options.spawnWorker));
    this.backgroundMode = canDetach ? "detach" : "inline";
  }

  on(handler: SessionEventHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  async run(request: CloudAgentRequest): Promise<CloudAgentResult> {
    switch (request.action) {
      case "launch":
        return { action: "launch", data: await this.launch(request) };
      case "reply":
        return { action: "reply", data: await this.reply(request) };
      case "get":
        return { action: "get", data: await this.get(request) };
      case "list":
        return { action: "list", data: await this.list(request) };
      case "watch":
        return { action: "watch", data: await this.watch(request) };
      case "dump":
        return { action: "dump", data: await this.dump(request) };
      case "cancel":
        return { action: "cancel", data: await this.cancel(request) };
      case "archive":
        return { action: "archive", data: await this.archive(request) };
      case "unarchive":
        return { action: "unarchive", data: await this.unarchive(request) };
      case "rename":
        return { action: "rename", data: await this.rename(request) };
      case "delete":
        return { action: "delete", data: await this.delete(request) };
      case "models":
        return this.models();
      case "list_artifacts":
        return this.listArtifacts(request);
      case "approve":
        return { action: "approve", data: await this.approve(request) };
    }
  }

  async launch(request: Omit<CloudAgentRequest, "action"> = {}): Promise<LaunchResult> {
    const prompt = requireField(request.prompt, "prompt", "launch");
    const cwd = resolveCwd(request, this.options.cwd);
    const now = new Date().toISOString();
    const sessionId = randomUUID();
    if (this.backgroundMode === "detach") {
      return this.launchDetached(request, sessionId, prompt, cwd, now);
    }
    await this.harness.connect();
    const harnessSession = await this.harness.startSession({
      cwd,
      prompt,
      sandbox: request.sandbox,
      approvalPolicy: request.approvalPolicy,
      model: request.model,
    });
    const stored: StoredSession = {
      sessionId,
      harness: this.harnessId,
      threadId: harnessSession.threadId ?? harnessSession.sessionId,
      cwd,
      sandbox: request.sandbox,
      approvalPolicy: request.approvalPolicy,
      model: request.model,
      title: request.title,
      lastPrompt: prompt,
      status: "running",
      isArchived: false,
      launched: true,
      createdAt: now,
      updatedAt: now,
      queuedPrompts: [],
    };
    await this.store.upsert(stored);
    this.live.set(sessionId, harnessSession);
    this.bindEvents(sessionId, harnessSession);
    await appendTranscript(this.store, sessionId, { role: "user", text: prompt });
    this.startBackgroundTurn(sessionId, harnessSession, prompt);
    return {
      id: sessionId,
      agent_id: sessionId,
      sessionId,
      url: sessionUrl(sessionId),
      status: "running",
    };
  }

  async reply(request: Omit<CloudAgentRequest, "action">): Promise<ReplyResult> {
    const id = requireField(resolveAgentId(request), "agent_id", "reply");
    const prompt = requireField(request.prompt, "prompt", "reply");
    const stored = await this.requireSession(id);
    if (stored.isArchived) {
      throw new UsageError(`Session ${stored.sessionId} is archived. Unarchive it before reply.`);
    }
    const interrupt = request.interrupt === true;
    const workerAlive = isPidAlive(stored.workerPid);
    const wasRunning = isActiveStatus(stored.status) || this.inflight.has(stored.sessionId) || workerAlive;
    const runId = randomUUID();
    if (this.backgroundMode === "detach") {
      return this.replyDetached(stored, prompt, interrupt, wasRunning, workerAlive, runId);
    }
    const session = await this.ensureLive(stored);

    if (interrupt && wasRunning) {
      try {
        await session.interrupt();
      } catch {
        // Harness may already have settled.
      }
      const current = this.inflight.get(stored.sessionId);
      if (current) {
        await current.catch(() => undefined);
      }
    } else if (wasRunning && !interrupt) {
      const queued = [...(stored.queuedPrompts ?? []), prompt];
      await this.store.patch(stored.sessionId, { queuedPrompts: queued, lastPrompt: prompt });
      await appendTranscript(this.store, stored.sessionId, { role: "event", type: "queued", text: prompt });
      return {
        id: stored.sessionId,
        agent_id: stored.sessionId,
        sessionId: stored.sessionId,
        url: sessionUrl(stored.sessionId),
        runId,
        interrupted: false,
        wasRunning: true,
        queued: true,
        status: stored.status,
      };
    }

    await this.store.patch(stored.sessionId, {
      status: "running",
      lastPrompt: prompt,
      error: undefined,
    });
    await appendTranscript(this.store, stored.sessionId, { role: "user", text: prompt });
    this.startBackgroundTurn(stored.sessionId, session, prompt);
    return {
      id: stored.sessionId,
      agent_id: stored.sessionId,
      sessionId: stored.sessionId,
      url: sessionUrl(stored.sessionId),
      runId,
      interrupted: interrupt && wasRunning,
      wasRunning,
      queued: false,
      status: "running",
    };
  }

  async get(request: Omit<CloudAgentRequest, "action"> | string): Promise<CloudAgentDetail> {
    const id = typeof request === "string" ? request : requireField(resolveAgentId(request), "agent_id", "get");
    return this.store.toDetail(await this.requireSession(id));
  }

  async list(request: Omit<CloudAgentRequest, "action"> = {}): Promise<CloudAgentSummary[]> {
    const scope = request.scope ?? "launched";
    const includeArchived = request.include_archived === true;
    let sessions = await this.store.list();
    if (scope === "launched") {
      sessions = sessions.filter((session) => session.launched && session.harness === this.harnessId);
    }
    if (!includeArchived) {
      sessions = sessions.filter((session) => !session.isArchived);
    }
    if (scope === "all") {
      try {
        await this.harness.connect();
        const remote = await this.harness.listSessions({ cwd: request.cwd });
        const known = new Set(sessions.map((session) => session.threadId ?? session.sessionId));
        for (const entry of remote) {
          if (known.has(entry.sessionId)) {
            continue;
          }
          const mapped = await this.store.get(entry.sessionId);
          if (mapped) {
            sessions.push(mapped);
          } else {
            sessions.push({
              sessionId: entry.sessionId,
              harness: this.harnessId,
              threadId: entry.sessionId,
              cwd: entry.cwd,
              title: entry.title,
              preview: entry.preview,
              status: "finished",
              isArchived: false,
              launched: false,
              createdAt: entry.createdAt ?? new Date().toISOString(),
              updatedAt: entry.updatedAt ?? new Date().toISOString(),
            });
          }
        }
      } catch {
        // Local store is enough when the harness cannot list.
      }
    }
    if (typeof request.limit === "number") {
      sessions = sessions.slice(0, request.limit);
    }
    return sessions.map((session) => this.store.toSummary(session));
  }

  async watch(request: Omit<CloudAgentRequest, "action"> | string): Promise<CloudAgentDetail> {
    const id = typeof request === "string" ? request : requireField(resolveAgentId(request), "agent_id", "watch");
    await this.requireSession(id);
    const pending = this.inflight.get(id);
    if (pending) {
      await pending.catch(() => undefined);
    }
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const current = await this.requireSession(id);
      if (isTerminalStatus(current.status) && !this.inflight.has(id)) {
        return this.store.toDetail(current);
      }
      if (
        isActiveStatus(current.status) &&
        !this.inflight.has(id) &&
        current.workerPid &&
        !isPidAlive(current.workerPid)
      ) {
        const again = await this.requireSession(id);
        if (isTerminalStatus(again.status)) {
          return this.store.toDetail(again);
        }
        return this.store.toDetail(
          await this.store.patch(id, {
            status: "error",
            error: again.error ?? "worker exited before the turn settled",
          }),
        );
      }
      await sleep(25);
    }
    return this.store.toDetail(await this.requireSession(id));
  }

  async dump(request: Omit<CloudAgentRequest, "action"> | string): Promise<DumpResult> {
    const resolved = typeof request === "string" ? { agent_id: request } : request;
    const id = requireField(resolveAgentId(resolved), "agent_id", "dump");
    const stored = await this.requireSession(id);
    const destination =
      resolved.path ?? path.join(this.store.sessionDir(stored.sessionId), "dump.jsonl");
    const copy = await writeTranscriptCopy(this.store, stored.sessionId, destination);
    return {
      agent_id: stored.sessionId,
      sessionId: stored.sessionId,
      path: copy.path,
      status: stored.status,
      lineCount: copy.lineCount,
      sizeBytes: copy.sizeBytes,
    };
  }

  async cancel(request: Omit<CloudAgentRequest, "action"> | string): Promise<CloudAgentDetail> {
    const id = typeof request === "string" ? request : requireField(resolveAgentId(request), "agent_id", "cancel");
    const stored = await this.requireSession(id);
    const live = this.live.get(stored.sessionId);
    if (live) {
      try {
        await live.interrupt();
      } catch {
        // already settled
      }
    }
    await mkdir(this.store.sessionDir(stored.sessionId), { recursive: true });
    await writeFile(this.store.cancelFlagPath(stored.sessionId), "1", "utf8");
    const next = await this.store.patch(stored.sessionId, {
      status: "cancelled",
      queuedPrompts: [],
    });
    return this.store.toDetail(next);
  }

  async archive(request: Omit<CloudAgentRequest, "action"> | string): Promise<CloudAgentDetail> {
    const id = typeof request === "string" ? request : requireField(resolveAgentId(request), "agent_id", "archive");
    const stored = await this.requireSession(id);
    return this.store.toDetail(await this.store.patch(stored.sessionId, { isArchived: true }));
  }

  async unarchive(request: Omit<CloudAgentRequest, "action"> | string): Promise<CloudAgentDetail> {
    const id = typeof request === "string" ? request : requireField(resolveAgentId(request), "agent_id", "unarchive");
    const stored = await this.requireSession(id);
    return this.store.toDetail(await this.store.patch(stored.sessionId, { isArchived: false }));
  }

  async rename(request: Omit<CloudAgentRequest, "action">): Promise<CloudAgentDetail> {
    const id = requireField(resolveAgentId(request), "agent_id", "rename");
    const title = requireField(request.title, "title", "rename");
    const stored = await this.requireSession(id);
    return this.store.toDetail(await this.store.patch(stored.sessionId, { title }));
  }

  async delete(request: Omit<CloudAgentRequest, "action"> | string): Promise<{ agent_id: string; deleted: true }> {
    const id = typeof request === "string" ? request : requireField(resolveAgentId(request), "agent_id", "delete");
    const stored = await this.requireSession(id);
    this.live.delete(stored.sessionId);
    this.inflight.delete(stored.sessionId);
    await this.store.remove(stored.sessionId);
    await rm(this.store.sessionDir(stored.sessionId), { recursive: true, force: true });
    return { agent_id: stored.sessionId, deleted: true };
  }

  async models(): Promise<CloudAgentResult> {
    return { action: "models", data: CODEX_MODELS };
  }

  async approve(request: Omit<CloudAgentRequest, "action">): Promise<ApproveResult> {
    const id = requireField(resolveAgentId(request), "agent_id", "approve");
    const requestId = requireField(request.requestId, "requestId", "approve");
    const decision = requireField(request.decision, "decision", "approve") as ApprovalDecision;
    const stored = await this.requireSession(id);
    const pending = (stored.pendingApprovals ?? []).find((entry) => entry.id === requestId);
    if (!pending) {
      throw new UsageError(`Pending approval ${requestId} not found on session ${stored.sessionId}`);
    }
    const delivered = this.harness.respondApproval?.(requestId, decision) === true;
    const workerAlive = isPidAlive(stored.workerPid);
    if (!delivered) {
      if (workerAlive) {
        await this.store.writeApprovalDecision(stored.sessionId, requestId, decision);
      } else {
        throw new UsageError(
          `No live harness connection to deliver approval ${requestId}. The session worker is not running.`,
        );
      }
    }
    const remaining = (stored.pendingApprovals ?? []).filter((entry) => entry.id !== requestId);
    await this.store.patch(stored.sessionId, { pendingApprovals: remaining });
    await appendTranscript(this.store, stored.sessionId, {
      role: "event",
      type: "approval.decided",
      text: `${decision} ${pending.kind} ${pending.summary}`.trim(),
    });
    return {
      agent_id: stored.sessionId,
      sessionId: stored.sessionId,
      requestId,
      decision,
      pendingApprovals: remaining,
      waitingOnApproval: remaining.length > 0,
    };
  }

  async listArtifacts(request: Omit<CloudAgentRequest, "action"> | string): Promise<CloudAgentResult> {
    const id = typeof request === "string" ? request : requireField(resolveAgentId(request), "agent_id", "list_artifacts");
    const stored = await this.requireSession(id);
    const file = this.store.transcriptPath(stored.sessionId);
    try {
      const info = await stat(file);
      return { action: "list_artifacts", data: [{ path: file, sizeBytes: info.size }] };
    } catch {
      return { action: "list_artifacts", data: [] };
    }
  }

  async runWorker(sessionId: string): Promise<void> {
    process.title = `grokc-worker:${sessionId.slice(0, 8)}`;
    const stored = await this.requireSession(sessionId);
    if (stored.status === "cancelled" || (await this.store.hasCancelFlag(sessionId))) {
      await this.store.patch(sessionId, { status: "cancelled", queuedPrompts: [] });
      return;
    }
    const prompt = requireField(stored.lastPrompt, "prompt", "worker");
    await this.store.patch(sessionId, { workerPid: process.pid, status: "running", error: undefined });
    await this.harness.connect();
    let session: HarnessSession;
    if (!stored.threadId) {
      session = await this.harness.startSession({
        cwd: stored.cwd ?? process.cwd(),
        prompt,
        sandbox: stored.sandbox,
        approvalPolicy: stored.approvalPolicy,
        model: stored.model,
      });
      await this.store.patch(sessionId, {
        threadId: session.threadId ?? session.sessionId,
      });
    } else {
      session = await this.ensureLive(stored);
    }
    this.live.set(sessionId, session);
    this.bindEvents(sessionId, session);
    this.startBackgroundTurn(sessionId, session, prompt);
    while (this.inflight.has(sessionId)) {
      const job = this.inflight.get(sessionId);
      if (!job) {
        break;
      }
      await job.catch(() => undefined);
    }
  }

  async close(options?: { drain?: boolean }): Promise<void> {
    if (options?.drain === false) {
      return;
    }
    const pending = [...this.inflight.values()];
    await Promise.all(pending.map((job) => job.catch(() => undefined)));
    for (const sessionId of this.flagWatchers.keys()) {
      this.clearFlagWatcher(sessionId);
    }
    await this.harness.disconnect();
  }

  private startBackgroundTurn(sessionId: string, session: HarnessSession, prompt: string): void {
    const job = this.executeTurn(sessionId, session, prompt)
      .catch(async (error) => {
        await this.store.patch(sessionId, {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (this.inflight.get(sessionId) === job) {
          this.inflight.delete(sessionId);
          this.clearFlagWatcher(sessionId);
        }
      });
    this.inflight.set(sessionId, job);
    this.watchControlFlags(sessionId, session);
  }

  private async executeTurn(sessionId: string, session: HarnessSession, prompt: string): Promise<void> {
    if (await this.store.hasCancelFlag(sessionId)) {
      await this.store.patch(sessionId, { status: "cancelled", queuedPrompts: [] });
      return;
    }
    await this.store.patch(sessionId, { status: "running", lastPrompt: prompt, error: undefined });
    const result = await session.turn(prompt);
    if (await this.store.hasCancelFlag(sessionId)) {
      await this.store.patch(sessionId, { status: "cancelled", queuedPrompts: [] });
      return;
    }
    const status = turnStatusToAgentStatus(result.status);
    await appendTranscript(this.store, sessionId, {
      role: "assistant",
      text: result.text,
      status,
      raw: { items: result.items, turnId: result.turnId, error: result.error },
    });
    const stored = await this.store.patch(sessionId, {
      status,
      lastText: result.text,
      lastTurnId: result.turnId,
      preview: result.text?.slice(0, 200),
      error: result.error,
    });
    if (status === "cancelled" || (await this.store.hasCancelFlag(sessionId))) {
      await this.store.patch(sessionId, { status: "cancelled", queuedPrompts: [] });
      return;
    }
    const queued = [...(stored.queuedPrompts ?? [])];
    const next = queued.shift();
    if (next) {
      await this.store.patch(sessionId, { queuedPrompts: queued });
      await appendTranscript(this.store, sessionId, { role: "user", text: next });
      this.startBackgroundTurn(sessionId, session, next);
    }
  }

  private async launchDetached(
    request: Omit<CloudAgentRequest, "action">,
    sessionId: string,
    prompt: string,
    cwd: string,
    now: string,
  ): Promise<LaunchResult> {
    const stored: StoredSession = {
      sessionId,
      harness: this.harnessId,
      cwd,
      sandbox: request.sandbox,
      approvalPolicy: request.approvalPolicy,
      model: request.model,
      title: request.title,
      lastPrompt: prompt,
      status: "creating",
      isArchived: false,
      launched: true,
      createdAt: now,
      updatedAt: now,
      queuedPrompts: [],
    };
    await this.store.upsert(stored);
    await appendTranscript(this.store, sessionId, { role: "user", text: prompt });
    const spawned = this.spawnWorkerProcess(sessionId);
    await this.store.patch(sessionId, {
      workerPid: spawned.pid,
      status: "running",
    });
    return {
      id: sessionId,
      agent_id: sessionId,
      sessionId,
      url: sessionUrl(sessionId),
      status: "running",
    };
  }

  private async replyDetached(
    stored: StoredSession,
    prompt: string,
    interrupt: boolean,
    wasRunning: boolean,
    workerAlive: boolean,
    runId: string,
  ): Promise<ReplyResult> {
    if (workerAlive && !interrupt) {
      const queued = [...(stored.queuedPrompts ?? []), prompt];
      await this.store.patch(stored.sessionId, { queuedPrompts: queued, lastPrompt: prompt });
      await appendTranscript(this.store, stored.sessionId, { role: "event", type: "queued", text: prompt });
      return {
        id: stored.sessionId,
        agent_id: stored.sessionId,
        sessionId: stored.sessionId,
        url: sessionUrl(stored.sessionId),
        runId,
        interrupted: false,
        wasRunning: true,
        queued: true,
        status: stored.status,
      };
    }

    if (workerAlive && interrupt) {
      const queued = [prompt, ...(stored.queuedPrompts ?? [])];
      await mkdir(this.store.sessionDir(stored.sessionId), { recursive: true });
      await writeFile(this.store.interruptFlagPath(stored.sessionId), "1", "utf8");
      await this.store.patch(stored.sessionId, {
        queuedPrompts: queued,
        lastPrompt: prompt,
        status: "running",
        error: undefined,
      });
      await appendTranscript(this.store, stored.sessionId, { role: "user", text: prompt });
      return {
        id: stored.sessionId,
        agent_id: stored.sessionId,
        sessionId: stored.sessionId,
        url: sessionUrl(stored.sessionId),
        runId,
        interrupted: true,
        wasRunning: true,
        queued: false,
        status: "running",
      };
    }

    await this.store.patch(stored.sessionId, {
      status: "running",
      lastPrompt: prompt,
      error: undefined,
    });
    await appendTranscript(this.store, stored.sessionId, { role: "user", text: prompt });
    const spawned = this.spawnWorkerProcess(stored.sessionId);
    await this.store.patch(stored.sessionId, { workerPid: spawned.pid });
    return {
      id: stored.sessionId,
      agent_id: stored.sessionId,
      sessionId: stored.sessionId,
      url: sessionUrl(stored.sessionId),
      runId,
      interrupted: interrupt && wasRunning,
      wasRunning,
      queued: false,
      status: "running",
    };
  }

  private spawnWorkerProcess(sessionId: string): { pid?: number } {
    const harness =
      typeof this.options.harness === "string" ? this.options.harness : this.harnessId;
    if (this.options.spawnWorker) {
      return this.options.spawnWorker({
        sessionId,
        stateDir: this.store.stateDir,
        harness,
        autoApprove: this.autoApprove,
      });
    }
    return spawnDetachedWorker({
      sessionId,
      stateDir: this.store.stateDir,
      harness,
      autoApprove: this.autoApprove,
    });
  }

  private watchControlFlags(sessionId: string, session: HarnessSession): void {
    if (this.flagWatchers.has(sessionId)) {
      return;
    }
    const timer = setInterval(() => {
      void this.pollControlFlags(sessionId, session);
    }, 40);
    this.flagWatchers.set(sessionId, timer);
  }

  private async pollControlFlags(sessionId: string, session: HarnessSession): Promise<void> {
    try {
      if (await this.store.hasCancelFlag(sessionId)) {
        await session.interrupt();
        return;
      }
      if (await this.store.hasInterruptFlag(sessionId)) {
        await this.store.clearInterruptFlag(sessionId);
        await session.interrupt();
      }
      const current = await this.store.get(sessionId);
      for (const pending of current?.pendingApprovals ?? []) {
        const decision = await this.store.readApprovalDecision(sessionId, pending.id);
        if (!decision) {
          continue;
        }
        if (this.harness.respondApproval?.(pending.id, decision)) {
          const remaining = (current?.pendingApprovals ?? []).filter((entry) => entry.id !== pending.id);
          await this.store.patch(sessionId, { pendingApprovals: remaining });
          await this.store.clearApprovalDecision(sessionId, pending.id);
        }
      }
    } catch {
      // Harness may already have settled.
    }
  }

  private clearFlagWatcher(sessionId: string): void {
    const timer = this.flagWatchers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.flagWatchers.delete(sessionId);
    }
  }

  private bindEvents(sessionId: string, session: HarnessSession): void {
    session.on((event) => {
      const remapped: SessionEvent = { ...event, sessionId } as SessionEvent;
      for (const listener of this.listeners) {
        listener(remapped);
      }
      if (remapped.type === "approval.needed") {
        void this.persistPendingApproval(sessionId, remapped);
      }
    });
  }

  private async persistPendingApproval(sessionId: string, event: ApprovalNeededEvent): Promise<void> {
    const harnessAuto = (this.harness as { autoApproval?: unknown }).autoApproval;
    if (this.autoApprove || harnessAuto) {
      return;
    }
    const stored = await this.store.get(sessionId);
    if (!stored) {
      return;
    }
    const existing = stored.pendingApprovals ?? [];
    if (existing.some((entry) => entry.id === event.requestId)) {
      return;
    }
    const next: PendingApproval = {
      id: event.requestId,
      kind: event.kind,
      summary: event.summary,
      threadId: event.threadId,
      turnId: event.turnId,
      method: event.method,
      payload: event.payload,
      createdAt: new Date().toISOString(),
    };
    await this.store.patch(sessionId, { pendingApprovals: [...existing, next] });
  }

  private async ensureLive(stored: StoredSession): Promise<HarnessSession> {
    const existing = this.live.get(stored.sessionId);
    if (existing) {
      return existing;
    }
    await this.harness.connect();
    const resumed = await this.harness.resumeSession(stored.threadId ?? stored.sessionId, {
      cwd: stored.cwd,
      sandbox: stored.sandbox,
      approvalPolicy: stored.approvalPolicy,
      model: stored.model,
    });
    this.live.set(stored.sessionId, resumed);
    this.bindEvents(stored.sessionId, resumed);
    return resumed;
  }

  private async requireSession(id: string): Promise<StoredSession> {
    const stored = await this.store.get(id);
    if (!stored) {
      throw new SessionNotFoundError(id);
    }
    return stored;
  }
}

function requireField(value: string | undefined, name: string, action: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new UsageError(`'${name}' is required for the '${action}' action.`);
  }
  return trimmed;
}

function resolveCwd(request: Omit<CloudAgentRequest, "action">, fallback?: string): string {
  if (request.cwd?.trim()) {
    return request.cwd.trim();
  }
  if (request.repo_url?.trim()) {
    return request.repo_url.trim();
  }
  return fallback ?? process.cwd();
}

function resolveAutoApproval(options: CreateClientOptions): AutoApprovalDecision | false {
  if (options.codex && "autoApproval" in options.codex && options.codex.autoApproval !== undefined) {
    return options.codex.autoApproval;
  }
  const flag = options.autoApprove;
  if (flag === true) {
    return "acceptForSession";
  }
  if (flag === "accept" || flag === "acceptForSession" || flag === "decline") {
    return flag;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
