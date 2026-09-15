import { EventEmitter } from "node:events";
import type { Readable, Writable } from "node:stream";
import { ProtocolError } from "../../errors.js";

export interface JsonlRequest {
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonlNotification {
  method: string;
  params?: unknown;
}

export interface JsonlResponse {
  id: number | string;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

export interface JsonlServerRequest {
  id: number | string;
  method: string;
  params?: unknown;
}

export type IncomingJsonl = JsonlResponse | JsonlNotification | JsonlServerRequest;

export function encodeJsonl(message: Record<string, unknown>): string {
  if ("jsonrpc" in message) {
    delete message.jsonrpc;
  }
  return `${JSON.stringify(message)}\n`;
}

export function decodeJsonlLine(line: string): IncomingJsonl | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  return JSON.parse(trimmed) as IncomingJsonl;
}

export function isResponse(message: IncomingJsonl): message is JsonlResponse {
  return "id" in message && !("method" in message);
}

export function isServerRequest(message: IncomingJsonl): message is JsonlServerRequest {
  return "id" in message && "method" in message;
}

export function isNotification(message: IncomingJsonl): message is JsonlNotification {
  return "method" in message && !("id" in message);
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export class JsonlConnection extends EventEmitter {
  private nextId = 1;
  private buffer = "";
  private readonly pending = new Map<number | string, Pending>();
  private closed = false;

  constructor(
    private readonly stdin: Writable,
    stdout: Readable,
  ) {
    super();
    stdout.setEncoding("utf8");
    stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.consume();
    });
    stdout.on("end", () => {
      this.failAll(new ProtocolError("codex app-server stdout closed"));
    });
    stdout.on("error", (error: Error) => {
      this.failAll(error);
    });
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    const message: JsonlRequest = params === undefined ? { id, method } : { id, method, params };
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
    });
    this.write(message as unknown as Record<string, unknown>);
    return promise;
  }

  notify(method: string, params?: unknown): void {
    const message: JsonlNotification = params === undefined ? { method } : { method, params };
    this.write(message as unknown as Record<string, unknown>);
  }

  respond(id: number | string, result: unknown): void {
    this.write({ id, result });
  }

  respondError(id: number | string, error: { code: number; message: string; data?: unknown }): void {
    this.write({ id, error });
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.failAll(new ProtocolError("codex JSONL connection closed"));
  }

  private write(message: Record<string, unknown>): void {
    if (this.closed) {
      throw new ProtocolError("cannot write to a closed JSONL connection");
    }
    this.stdin.write(encodeJsonl(message));
    this.emit("send", message);
  }

  private consume(): void {
    while (true) {
      const index = this.buffer.indexOf("\n");
      if (index === -1) {
        return;
      }
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      let message: IncomingJsonl | null;
      try {
        message = decodeJsonlLine(line);
      } catch (error) {
        this.emit("error", error);
        continue;
      }
      if (!message) {
        continue;
      }
      this.dispatch(message);
    }
  }

  private dispatch(message: IncomingJsonl): void {
    if (isResponse(message)) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        this.emit("orphan-response", message);
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new ProtocolError(message.error.message ?? "codex app-server error", {
            code: message.error.code,
            data: message.error.data,
          }),
        );
        return;
      }
      pending.resolve(message.result);
      return;
    }
    if (isServerRequest(message)) {
      this.emit("server-request", message);
      return;
    }
    if (isNotification(message)) {
      this.emit("notification", message);
    }
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}
