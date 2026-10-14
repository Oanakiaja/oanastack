import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { planWatches, runWatch, sleep } from "./attach.js";
import { loadWebhookConfig, type WebhookConfig } from "./config.js";
import { deliverDue, deliverEvent, type DeliverOptions } from "./deliver.js";
import { TriggerError } from "./errors.js";
import { createHerdrRunner, type HerdrRunner } from "./herdr.js";
import { normalizeEvent } from "./normalize.js";
import type { TriggerLocation } from "./paths.js";
import type { TriggerStore } from "./store.js";
import type { StatusSnapshot } from "./types.js";

export interface ServerRecord {
  pid: number;
  url: string;
  startedAt: string;
}

export interface RunningServer {
  port: number;
  hostname: string;
  url: string;
  close: () => Promise<void>;
}

export function assertLoopback(hostname: string): void {
  if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "::1") {
    throw new TriggerError("refusing non-loopback host; trigger stays on localhost", "invalid");
  }
}

export function createTriggerApp(options: {
  store: TriggerStore;
  logPath: string;
  webhook: () => WebhookConfig | null;
  service?: { up: boolean; url: string | null };
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  backoffMs?: (attempt: number) => number;
  now?: () => Date;
}): Hono {
  const app = new Hono();
  const deliverOptions = (): DeliverOptions => ({
    logPath: options.logPath,
    webhook: options.webhook(),
    fetchImpl: options.fetchImpl,
    maxAttempts: options.maxAttempts,
    backoffMs: options.backoffMs,
    now: options.now,
  });

  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/v1/health", (c) => c.json({ ok: true }));
  app.get("/v1/status", (c) => c.json(readStatus(options.store, options.logPath, options.webhook(), options.service)));
  app.post("/v1/events", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }
    try {
      const event = normalizeEvent(body, options.now?.());
      const result = options.store.ingest(event, options.now?.());
      if (result.forward && result.id !== null) {
        const state = await deliverEvent(options.store, result.id, deliverOptions());
        return c.json({ ...result, state }, state === "sent" ? 200 : 202);
      }
      return c.json(result, 200);
    } catch (error) {
      if (error instanceof TriggerError && error.code === "invalid") {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  });
  return app;
}

export function readStatus(
  store: TriggerStore,
  logPath: string,
  webhook: WebhookConfig | null,
  service: { up: boolean; url: string | null } = { up: true, url: null },
): StatusSnapshot {
  return {
    service,
    db: store.path,
    log: logPath,
    counts: store.counts(),
    webhook: { configured: webhook !== null, source: webhook?.source ?? null },
    agents: store.listAgents(),
    lastDelivery: store.lastDelivery(),
  };
}

export function startTriggerServer(options: {
  store: TriggerStore;
  port: number;
  hostname?: string;
  logPath: string;
  location: TriggerLocation;
  env?: NodeJS.ProcessEnv;
  watch?: boolean;
  watchIntervalMs?: number;
  runner?: HerdrRunner;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  backoffMs?: (attempt: number) => number;
  now?: () => Date;
}): Promise<RunningServer> {
  const hostname = options.hostname ?? "127.0.0.1";
  assertLoopback(hostname);
  const port = options.port;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new TriggerError("port must be an integer from 0 to 65535", "invalid");
  }
  const env = options.env ?? process.env;
  const webhook = () => loadWebhookConfig(env, options.location);
  const service = { up: true, url: null as string | null };
  const app = createTriggerApp({
    store: options.store,
    logPath: options.logPath,
    webhook,
    service,
    fetchImpl: options.fetchImpl,
    maxAttempts: options.maxAttempts,
    backoffMs: options.backoffMs,
    now: options.now,
  });
  const abort = new AbortController();
  const deliverOptions = (): DeliverOptions => ({
    logPath: options.logPath,
    webhook: webhook(),
    fetchImpl: options.fetchImpl,
    maxAttempts: options.maxAttempts,
    backoffMs: options.backoffMs,
    now: options.now,
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
      if (settled) return;
      settled = true;
      const bound = info.port;
      const host = hostname === "::1" ? "[::1]" : hostname;
      const url = `http://${host}:${bound}`;
      service.url = url;
      writeServerFile(options.location.serverFile, { pid: process.pid, url, startedAt: new Date().toISOString() });
      const worker = loop(abort.signal, async () => {
        await deliverDue(options.store, deliverOptions());
      });
      const watcher =
        options.watch === false
          ? Promise.resolve()
          : supervise(
              abort.signal,
              options.runner ?? createHerdrRunner(env.HERDR_BIN, env),
              options.store,
              deliverOptions,
              options.watchIntervalMs ?? 5_000,
            );
      resolve({
        port: bound,
        hostname,
        url,
        close: async () => {
          abort.abort();
          await worker;
          await watcher;
          await closeServer(server);
          removeServerFile(options.location.serverFile);
        },
      });
    });
    server.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

export function writeServerFile(file: string, record: ServerRecord): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(record)}\n`);
  renameSync(tmp, file);
}

export function readServerFile(file: string): ServerRecord | null {
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<ServerRecord>;
    if (typeof parsed.pid !== "number" || typeof parsed.url !== "string") return null;
    return { pid: parsed.pid, url: parsed.url, startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : "" };
  } catch {
    return null;
  }
}

export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function probeService(url: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`${url.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

function removeServerFile(file: string): void {
  try {
    unlinkSync(file);
  } catch {
    // already gone
  }
}

async function loop(signal: AbortSignal, tick: () => Promise<void>): Promise<void> {
  while (!signal.aborted) {
    try {
      await tick();
    } catch {
      // a single delivery failure stays in sqlite and the log
    }
    await sleep(1_000, signal);
  }
}

async function supervise(
  signal: AbortSignal,
  runner: HerdrRunner,
  store: TriggerStore,
  options: () => DeliverOptions,
  intervalMs: number,
): Promise<void> {
  const watching = new Map<string, AbortController>();
  while (!signal.aborted) {
    try {
      const live = await runner.list();
      const plan = planWatches(live, new Set(watching.keys()));
      for (const name of plan.stop) {
        watching.get(name)?.abort();
        watching.delete(name);
      }
      for (const agent of plan.start) {
        if (!agent.name) continue;
        const child = new AbortController();
        watching.set(agent.name, child);
        const onParentAbort = () => child.abort();
        signal.addEventListener("abort", onParentAbort, { once: true });
        void runWatch({
          agent: agent.name,
          kind: agent.kind ?? undefined,
          cwd: agent.cwd,
          worktree: agent.worktree,
          runner,
          memory: { lastStatus: null },
          intervalMs,
          signal: child.signal,
          onSession: (place) => {
            store.recordSession({
              agent: agent.name ?? "",
              kind: place.kind,
              branch: place.branch,
              cwd: place.cwd,
              worktree: place.worktree,
            });
          },
          post: async (event) => {
            const normalized = normalizeEvent(event);
            const result = store.ingest(normalized);
            if (result.forward && result.id !== null) await deliverEvent(store, result.id, options());
          },
        });
      }
    } catch {
      // herdr is optional; events can still arrive over HTTP
    }
    await sleep(intervalMs, signal);
  }
  for (const child of watching.values()) child.abort();
}

function closeServer(server: ServerType): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
