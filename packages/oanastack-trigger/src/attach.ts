import type { AgentKind, AgentStatus, HerdrSnapshot, StatusSnapshot } from "./types.js";
import type { HerdrRunner } from "./herdr.js";
import { firstLine } from "./normalize.js";

export interface WatchMemory {
  lastStatus: AgentStatus | null;
}

export interface WatchTick {
  memory: WatchMemory;
  posted: boolean;
  snapshot: HerdrSnapshot | null;
}

export async function watchOnce(options: {
  agent: string;
  kind?: AgentKind;
  runner: Pick<HerdrRunner, "get" | "read">;
  post: (event: Record<string, unknown>) => Promise<void>;
  memory: WatchMemory;
  lines?: number;
  cwd?: string | null;
  worktree?: string | null;
  now?: () => Date;
}): Promise<WatchTick> {
  const snapshot = await options.runner.get(options.agent);
  if (!snapshot || !snapshot.status) return { memory: options.memory, posted: false, snapshot };
  if (snapshot.status === options.memory.lastStatus) {
    return { memory: options.memory, posted: false, snapshot };
  }
  const kind = snapshot.kind ?? options.kind ?? null;
  if (!kind) return { memory: { lastStatus: snapshot.status }, posted: false, snapshot };
  const terminal = snapshot.status === "done" || snapshot.status === "blocked";
  const text = terminal ? await options.runner.read(options.agent, options.lines ?? 60) : null;
  const summary = firstLine(text);
  await options.post({
    agent: options.agent,
    kind,
    status: snapshot.status,
    summary,
    text,
    cwd: snapshot.cwd ?? options.cwd ?? null,
    worktree: snapshot.worktree ?? options.worktree ?? null,
    ts: (options.now ?? (() => new Date()))().toISOString(),
  });
  return { memory: { lastStatus: snapshot.status }, posted: true, snapshot };
}

export function seedFromStatus(status: StatusSnapshot, agent: string): WatchMemory {
  const found = status.agents.find((item) => item.agent === agent);
  return { lastStatus: found?.lastStatus ?? null };
}

export function planWatches(
  live: readonly HerdrSnapshot[],
  watching: ReadonlySet<string>,
): { start: HerdrSnapshot[]; stop: string[] } {
  const wanted = new Map<string, HerdrSnapshot>();
  for (const agent of live) {
    if (agent.kind !== "codex" && agent.kind !== "claude") continue;
    if (!agent.name) continue;
    wanted.set(agent.name, agent);
  }
  const start = [...wanted.values()].filter((agent) => !watching.has(agent.name ?? ""));
  const stop = [...watching].filter((name) => !wanted.has(name));
  return { start, stop };
}

export async function runWatch(options: {
  agent: string;
  kind?: AgentKind;
  runner: Pick<HerdrRunner, "get" | "read">;
  post: (event: Record<string, unknown>) => Promise<void>;
  memory: WatchMemory;
  intervalMs: number;
  signal: AbortSignal;
  lines?: number;
  cwd?: string | null;
  worktree?: string | null;
  now?: () => Date;
}): Promise<void> {
  let memory = options.memory;
  while (!options.signal.aborted) {
    try {
      const tick = await watchOnce({ ...options, memory });
      memory = tick.memory;
    } catch {
      // herdr or the trigger service can be down between polls
    }
    await sleep(options.intervalMs, options.signal);
  }
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
