import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { ProtocolError } from "../errors.js";
import type { SessionEvent, SessionEventHandler } from "../events.js";
import type { ListOpts, ResumeOpts, SessionSummary, StartOpts, TurnResult } from "../types.js";
import type { CodingAgentHarness, HarnessSession } from "./types.js";

export interface FakeHarnessOptions {
  delayMs?: number;
  text?: string | ((prompt: string) => string);
}

class FakeSession implements HarnessSession {
  private readonly emitter = new EventEmitter();
  private active = false;
  private interrupted = false;

  constructor(
    readonly sessionId: string,
    readonly threadId: string,
    private readonly harness: FakeHarness,
  ) {}

  on(handler: SessionEventHandler): () => void {
    this.emitter.on("event", handler);
    return () => {
      this.emitter.off("event", handler);
    };
  }

  async turn(prompt: string): Promise<TurnResult> {
    this.active = true;
    this.interrupted = false;
    this.harness.markActive(this.sessionId, true);
    this.emit({ type: "turn.started", sessionId: this.sessionId, turnId: `turn-${this.sessionId}` });
    const delay = this.harness.delayMs;
    const started = Date.now();
    while (Date.now() - started < delay) {
      if (this.interrupted) {
        this.active = false;
        this.harness.markActive(this.sessionId, false);
        const result: TurnResult = {
          sessionId: this.sessionId,
          text: "",
          status: "interrupted",
          turnId: `turn-${this.sessionId}`,
          items: [],
        };
        this.emit({
          type: "turn.completed",
          sessionId: this.sessionId,
          turnId: result.turnId,
          status: "interrupted",
        });
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(10, delay)));
    }
    const text = this.harness.render(prompt);
    const item = {
      id: `item-${this.sessionId}`,
      type: "agentMessage",
      text,
      raw: { id: `item-${this.sessionId}`, type: "agentMessage", text },
    };
    this.emit({ type: "item.completed", sessionId: this.sessionId, item });
    const result: TurnResult = {
      sessionId: this.sessionId,
      text,
      status: "completed",
      turnId: `turn-${this.sessionId}`,
      items: [item],
    };
    this.emit({
      type: "turn.completed",
      sessionId: this.sessionId,
      turnId: result.turnId,
      status: "completed",
      text,
    });
    this.active = false;
    this.harness.markActive(this.sessionId, false);
    this.harness.recordTurn(this.sessionId, prompt, text);
    return result;
  }

  async steer(prompt: string): Promise<void> {
    if (!this.active) {
      throw new ProtocolError("no in-flight turn to steer");
    }
    this.harness.recordSteer(this.sessionId, prompt);
  }

  async interrupt(): Promise<void> {
    this.interrupted = true;
    this.harness.recordInterrupt(this.sessionId);
  }

  private emit(event: SessionEvent): void {
    this.emitter.emit("event", event);
  }
}

export class FakeHarness implements CodingAgentHarness {
  readonly id = "codex" as const;
  readonly sessions = new Map<string, { cwd: string; prompt?: string; text?: string }>();
  readonly steers: { sessionId: string; prompt: string }[] = [];
  readonly interrupts: string[] = [];
  readonly active = new Set<string>();
  delayMs: number;
  private readonly textOption: FakeHarnessOptions["text"];

  constructor(options: FakeHarnessOptions = {}) {
    const envDelay = Number(process.env.GROKBOT_CODING_AGENT_CLI_FAKE_DELAY_MS ?? 0);
    this.delayMs = options.delayMs ?? (Number.isFinite(envDelay) ? envDelay : 0);
    this.textOption = options.text ?? ((prompt) => `echo:${prompt}`);
  }

  render(prompt: string): string {
    return typeof this.textOption === "function" ? this.textOption(prompt) : (this.textOption ?? `echo:${prompt}`);
  }

  markActive(sessionId: string, active: boolean): void {
    if (active) {
      this.active.add(sessionId);
    } else {
      this.active.delete(sessionId);
    }
  }

  recordTurn(sessionId: string, prompt: string, text: string): void {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.prompt = prompt;
      existing.text = text;
    }
  }

  recordSteer(sessionId: string, prompt: string): void {
    this.steers.push({ sessionId, prompt });
  }

  recordInterrupt(sessionId: string): void {
    this.interrupts.push(sessionId);
  }

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async startSession(opts: StartOpts): Promise<HarnessSession> {
    const id = randomUUID();
    this.sessions.set(id, { cwd: opts.cwd, prompt: opts.prompt });
    return new FakeSession(id, id, this);
  }

  async resumeSession(id: string, opts?: ResumeOpts): Promise<HarnessSession> {
    if (!this.sessions.has(id)) {
      this.sessions.set(id, { cwd: opts?.cwd ?? process.cwd() });
    }
    return new FakeSession(id, id, this);
  }

  async listSessions(_opts?: ListOpts): Promise<SessionSummary[]> {
    return [...this.sessions.entries()].map(([sessionId, session]) => ({
      sessionId,
      harness: this.id,
      cwd: session.cwd,
      lastPrompt: session.prompt,
    }));
  }
}
