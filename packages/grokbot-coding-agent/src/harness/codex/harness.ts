import { spawn as defaultSpawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { ProtocolError } from "../../errors.js";
import type { SessionEvent, SessionEventHandler } from "../../events.js";
import { extractAgentText, normalizeItem } from "../../events.js";
import type {
  HarnessId,
  ListOpts,
  ResumeOpts,
  SessionSummary,
  StartOpts,
  TurnResult,
} from "../../types.js";
import type { CodingAgentHarness, HarnessSession } from "../types.js";
import { approvalResult, describeApproval, isApprovalMethod } from "./approvals.js";
import type { ApprovalDecision } from "../../types.js";
import { JsonlConnection, type JsonlNotification, type JsonlServerRequest } from "./jsonl.js";
import { applyNotification, emptyTurnSnapshot, type CodexTurnSnapshot } from "./normalize.js";
import {
  DEFAULT_CODEX_OPT_OUT_NOTIFICATIONS,
  type CodexHarnessOptions,
} from "./options.js";
import { CLIENT_INFO_NAME, PACKAGE_NAME, PACKAGE_VERSION } from "../../version.js";

interface ThreadObject {
  id?: string;
  sessionId?: string;
  preview?: string;
  name?: string;
  cwd?: string;
  createdAt?: number | string;
  status?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function threadFromResult(result: unknown): ThreadObject {
  const record = asRecord(result);
  const thread = asRecord(record?.thread) ?? record ?? {};
  return thread as ThreadObject;
}

function isoFromCreatedAt(value: number | string | undefined): string | undefined {
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return undefined;
}

export class CodexHarness extends EventEmitter implements CodingAgentHarness {
  readonly id: HarnessId = "codex";
  private process: ChildProcess | undefined;
  private connection: JsonlConnection | undefined;
  private connecting: Promise<void> | undefined;
  private readonly pendingServerRequests = new Map<string, JsonlServerRequest>();

  constructor(private readonly options: CodexHarnessOptions = {}) {
    super();
  }

  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }
    if (this.connecting) {
      await this.connecting;
      return;
    }
    this.connecting = this.open();
    try {
      await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  async disconnect(): Promise<void> {
    const connection = this.connection;
    const child = this.process;
    this.connection = undefined;
    this.process = undefined;
    connection?.close();
    if (child && !child.killed) {
      child.kill();
    }
  }

  async startSession(opts: StartOpts): Promise<HarnessSession> {
    await this.connect();
    const params: Record<string, unknown> = { cwd: opts.cwd };
    if (opts.model) {
      params.model = opts.model;
    }
    if (opts.sandbox) {
      params.sandbox = opts.sandbox;
    }
    if (opts.approvalPolicy) {
      params.approvalPolicy = opts.approvalPolicy;
    }
    const result = await this.rpc("thread/start", params);
    const thread = threadFromResult(result);
    if (!thread.id) {
      throw new ProtocolError("thread/start did not return a thread id");
    }
    return new CodexHarnessSession(this, thread.id, thread.id);
  }

  async resumeSession(id: string, opts?: ResumeOpts): Promise<HarnessSession> {
    await this.connect();
    const params: Record<string, unknown> = { threadId: id };
    if (opts?.cwd) {
      params.cwd = opts.cwd;
    }
    if (opts?.model) {
      params.model = opts.model;
    }
    if (opts?.sandbox) {
      params.sandbox = opts.sandbox;
    }
    if (opts?.approvalPolicy) {
      params.approvalPolicy = opts.approvalPolicy;
    }
    const result = await this.rpc("thread/resume", params);
    const thread = threadFromResult(result);
    const threadId = thread.id ?? id;
    return new CodexHarnessSession(this, threadId, threadId);
  }

  async listSessions(opts?: ListOpts): Promise<SessionSummary[]> {
    await this.connect();
    const params: Record<string, unknown> = {};
    if (opts?.cwd) {
      params.cwd = opts.cwd;
    }
    if (opts?.cursor) {
      params.cursor = opts.cursor;
    }
    const result = await this.rpc("thread/list", Object.keys(params).length > 0 ? params : {});
    const record = asRecord(result);
    const data = Array.isArray(record?.data)
      ? record.data
      : Array.isArray(record?.threads)
        ? record.threads
        : [];
    return data.map((entry) => {
      const thread = (asRecord(entry) ?? {}) as ThreadObject;
      const threadId = thread.id ?? "";
      return {
        sessionId: threadId,
        harness: this.id,
        cwd: thread.cwd,
        createdAt: isoFromCreatedAt(thread.createdAt),
        title: thread.name,
        preview: thread.preview,
        status: thread.status,
      };
    });
  }

  bindSession(sessionId: string, threadId: string): HarnessSession {
    return new CodexHarnessSession(this, sessionId, threadId);
  }

  async rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
    return this.requireConnection().request<T>(method, params);
  }

  requireConnection(): JsonlConnection {
    if (!this.connection) {
      throw new ProtocolError("codex app-server is not connected");
    }
    return this.connection;
  }

  get autoApproval() {
    return this.options.autoApproval ?? false;
  }

  respondApproval(requestId: string, decision: ApprovalDecision): boolean {
    const request = this.pendingServerRequests.get(requestId);
    const connection = this.connection;
    if (!request || !connection) {
      return false;
    }
    this.answerApproval(request, decision);
    return true;
  }

  private async open(): Promise<void> {
    const command = this.options.command ?? process.env.CODEX_BIN ?? "codex";
    const args = this.options.args ?? ["app-server"];
    const spawnFn = this.options.spawn ?? defaultSpawn;
    const child = spawnFn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: this.options.env ?? process.env,
    });
    if (!child.stdin || !child.stdout) {
      throw new ProtocolError("failed to open stdio pipes for codex app-server");
    }
    this.process = child;
    const connection = new JsonlConnection(child.stdin, child.stdout);
    this.connection = connection;

    child.on("exit", () => {
      if (this.process === child) {
        this.connection = undefined;
        this.process = undefined;
      }
    });

    connection.on("notification", (notification: JsonlNotification) => {
      this.emit("notification", notification);
    });
    connection.on("server-request", (request: JsonlServerRequest) => {
      this.emit("server-request", request);
      if (!isApprovalMethod(request.method)) {
        return;
      }
      this.pendingServerRequests.set(String(request.id), request);
      const decision = this.autoApproval;
      if (decision) {
        this.answerApproval(request, decision);
      }
    });

    await connection.request("initialize", {
      clientInfo: {
        name: this.options.clientName ?? CLIENT_INFO_NAME,
        title: this.options.clientTitle ?? PACKAGE_NAME,
        version: this.options.clientVersion ?? PACKAGE_VERSION,
      },
      capabilities: {
        optOutNotificationMethods: [...DEFAULT_CODEX_OPT_OUT_NOTIFICATIONS],
      },
    });
    connection.notify("initialized", {});
  }

  private answerApproval(request: JsonlServerRequest, decision: ApprovalDecision): void {
    const connection = this.connection;
    if (!connection || !isApprovalMethod(request.method)) {
      return;
    }
    connection.respond(request.id, approvalResult(request.method, decision, request.params));
    this.pendingServerRequests.delete(String(request.id));
  }
}

class CodexHarnessSession implements HarnessSession {
  private readonly emitter = new EventEmitter();
  private activeTurnId: string | undefined;

  constructor(
    private readonly harness: CodexHarness,
    readonly sessionId: string,
    readonly threadId: string,
  ) {}

  on(handler: SessionEventHandler): () => void {
    this.emitter.on("event", handler);
    return () => {
      this.emitter.off("event", handler);
    };
  }

  async turn(prompt: string): Promise<TurnResult> {
    const snapshotRef = { current: emptyTurnSnapshot() };
    const completed = this.waitForCompletion(snapshotRef);

    const result = await this.harness.rpc("turn/start", {
      threadId: this.threadId,
      input: [{ type: "text", text: prompt }],
    });
    const turn = asRecord(asRecord(result)?.turn);
    const turnId = typeof turn?.id === "string" ? turn.id : undefined;
    if (turnId) {
      this.activeTurnId = turnId;
      snapshotRef.current = { ...snapshotRef.current, turnId };
    }

    const snapshot = await completed;
    this.activeTurnId = undefined;
    return {
      sessionId: this.sessionId,
      text: snapshot.text,
      status: snapshot.status,
      turnId: snapshot.turnId ?? turnId,
      items: snapshot.items,
      error: snapshot.error,
    };
  }

  async steer(prompt: string): Promise<void> {
    if (!this.activeTurnId) {
      throw new ProtocolError("no in-flight turn to steer");
    }
    await this.harness.rpc("turn/steer", {
      threadId: this.threadId,
      expectedTurnId: this.activeTurnId,
      input: [{ type: "text", text: prompt }],
    });
  }

  async interrupt(): Promise<void> {
    const params: Record<string, unknown> = { threadId: this.threadId };
    if (this.activeTurnId) {
      params.turnId = this.activeTurnId;
    }
    await this.harness.rpc("turn/interrupt", params);
  }

  private waitForCompletion(snapshotRef: { current: CodexTurnSnapshot }): Promise<CodexTurnSnapshot> {
    return new Promise((resolve, reject) => {
      const onNotification = (notification: JsonlNotification) => {
        if (!this.matchesThread(notification.params)) {
          return;
        }
        const applied = applyNotification(this.sessionId, snapshotRef.current, notification);
        snapshotRef.current = applied.snapshot;
        if (applied.event) {
          this.emit(applied.event);
        }
        if (notification.method === "turn/completed") {
          cleanup();
          const turn = asRecord(asRecord(notification.params)?.turn);
          const items = Array.isArray(turn?.items)
            ? turn.items.map(normalizeItem)
            : snapshotRef.current.items;
          resolve({
            ...snapshotRef.current,
            items,
            text: extractAgentText(items.map((item) => item.raw)) || snapshotRef.current.text,
          });
        }
      };
      const onServerRequest = (request: JsonlServerRequest) => {
        if (!isApprovalMethod(request.method) || !this.matchesThread(request.params)) {
          return;
        }
        const described = describeApproval(request);
        this.emit({
          type: "approval.needed",
          sessionId: this.sessionId,
          requestId: String(request.id),
          kind: described.kind,
          summary: described.summary,
          threadId: described.threadId,
          turnId: described.turnId,
          method: request.method,
          payload: described.payload,
        });
      };
      const onError = (error: unknown) => {
        cleanup();
        reject(error instanceof Error ? error : new ProtocolError(String(error)));
      };
      const cleanup = () => {
        this.harness.off("notification", onNotification);
        this.harness.off("server-request", onServerRequest);
        this.harness.off("error", onError);
      };
      this.harness.on("notification", onNotification);
      this.harness.on("server-request", onServerRequest);
      this.harness.on("error", onError);
    });
  }

  private matchesThread(params: unknown): boolean {
    const record = asRecord(params);
    if (!record) {
      return true;
    }
    if (typeof record.threadId === "string") {
      return record.threadId === this.threadId;
    }
    const turn = asRecord(record.turn);
    if (typeof turn?.threadId === "string") {
      return turn.threadId === this.threadId;
    }
    return true;
  }

  private emit(event: SessionEvent): void {
    this.emitter.emit("event", event);
  }
}
