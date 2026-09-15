import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import type { CodexSpawnFn } from "../../src/harness/codex/options.js";

export interface ScriptedRequest {
  method: string;
  id?: number | string;
  params?: unknown;
}

export function createScriptedCodexSpawn(options?: {
  agentText?: string;
  onRequest?: (request: ScriptedRequest, send: (message: Record<string, unknown>) => void) => boolean | void;
}): { spawn: CodexSpawnFn; sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  const agentText = options?.agentText ?? "coach-ok";

  const spawn: CodexSpawnFn = () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = new EventEmitter() as ChildProcess;
    Object.assign(child, {
      stdin,
      stdout,
      stderr,
      killed: false,
      kill: () => {
        (child as ChildProcess & { killed: boolean }).killed = true;
        child.emit("exit", 0, null);
        return true;
      },
    });

    const send = (message: Record<string, unknown>) => {
      stdout.write(`${JSON.stringify(message)}\n`);
    };

    let buffer = "";
    stdin.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();
      while (true) {
        const index = buffer.indexOf("\n");
        if (index === -1) {
          return;
        }
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (!line.trim()) {
          continue;
        }
        const request = JSON.parse(line) as ScriptedRequest & Record<string, unknown>;
        sent.push(request);
        if (options?.onRequest?.(request, send) === true) {
          continue;
        }
        handleDefault(request, send, agentText);
      }
    });

    return child;
  };

  return { spawn, sent };
}

function handleDefault(
  request: ScriptedRequest & Record<string, unknown>,
  send: (message: Record<string, unknown>) => void,
  agentText: string,
): void {
  if (request.method === "initialize") {
    send({
      id: request.id,
      result: { userAgent: "codex-scripted", platformFamily: "unix", platformOs: "linux" },
    });
    return;
  }
  if (request.method === "initialized") {
    return;
  }
  if (request.method === "thread/start") {
    send({
      id: request.id,
      result: {
        thread: { id: "thr_scripted", sessionId: "thr_scripted", preview: "", createdAt: 1_730_910_000 },
      },
    });
    send({ method: "thread/started", params: { thread: { id: "thr_scripted" } } });
    return;
  }
  if (request.method === "thread/resume") {
    send({
      id: request.id,
      result: { thread: { id: "thr_scripted", sessionId: "thr_scripted" } },
    });
    return;
  }
  if (request.method === "thread/list") {
    send({
      id: request.id,
      result: {
        data: [{ id: "thr_scripted", name: "scripted", preview: agentText, cwd: "/tmp", status: "idle" }],
        nextCursor: null,
      },
    });
    return;
  }
  if (request.method === "turn/start") {
    send({
      id: request.id,
      result: { turn: { id: "turn_1", status: "inProgress", items: [] } },
    });
    send({ method: "turn/started", params: { threadId: "thr_scripted", turn: { id: "turn_1" } } });
    const item = { id: "item_1", type: "agentMessage", text: agentText };
    send({ method: "item/started", params: { threadId: "thr_scripted", item } });
    send({ method: "item/completed", params: { threadId: "thr_scripted", item } });
    send({
      method: "turn/completed",
      params: {
        threadId: "thr_scripted",
        turn: { id: "turn_1", status: "completed", items: [item] },
      },
    });
    return;
  }
  if (request.method === "turn/steer") {
    send({ id: request.id, result: { turnId: "turn_1" } });
    return;
  }
  if (request.method === "turn/interrupt") {
    send({ id: request.id, result: {} });
    send({
      method: "turn/completed",
      params: {
        threadId: "thr_scripted",
        turn: { id: "turn_1", status: "interrupted", items: [] },
      },
    });
    return;
  }
  if (request.id !== undefined) {
    send({ id: request.id, result: {} });
  }
}
