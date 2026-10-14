import { spawn } from "node:child_process";
import { sessionPlace } from "./attach.js";
import { TriggerError } from "./errors.js";
import { createHerdrRunner, herdrStarted, type HerdrRunner } from "./herdr.js";
import { resolveTriggerLocation, defaultServiceUrl } from "./paths.js";
import { probeService } from "./server.js";
import { TriggerStore } from "./store.js";
import type { AgentKind, HerdrSnapshot } from "./types.js";
import { herdrStartArgs, type HerdrStartSpec } from "./yolo.js";

export interface StartArgs {
  agent: string;
  kind: AgentKind;
  pane: string;
  cwd?: string;
  worktree?: string;
  timeoutMs?: number;
  yolo: boolean;
  attach: boolean;
  serve: boolean;
  json: boolean;
  extra: string[];
}

const AGENT_NAME = /^[a-z][a-z0-9_-]{0,31}$/;

export function parseStartArgv(argv: string[]): StartArgs {
  const extraSep = argv.indexOf("--");
  const flags = extraSep === -1 ? argv : argv.slice(0, extraSep);
  const extra = extraSep === -1 ? [] : argv.slice(extraSep + 1);
  let agent: string | undefined;
  let kind: string | undefined;
  let pane: string | undefined;
  let cwd: string | undefined;
  let worktree: string | undefined;
  let timeout: string | undefined;
  let yolo = true;
  let attach = true;
  let serve = true;
  let json = false;

  for (let index = 0; index < flags.length; index += 1) {
    const token = flags[index];
    if (!token) continue;
    if (token === "--no-yolo") {
      yolo = false;
      continue;
    }
    if (token === "--no-attach") {
      attach = false;
      continue;
    }
    if (token === "--no-serve") {
      serve = false;
      continue;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--kind" || token === "--pane" || token === "--cwd" || token === "--worktree" || token === "--timeout") {
      const value = flags[index + 1];
      if (!value || value.startsWith("-")) throw new TriggerError(`${token} needs a value`, "invalid");
      index += 1;
      if (token === "--kind") kind = value;
      else if (token === "--pane") pane = value;
      else if (token === "--cwd") cwd = value;
      else if (token === "--worktree") worktree = value;
      else timeout = value;
      continue;
    }
    if (token.startsWith("-")) throw new TriggerError(`unknown flag ${token}`, "invalid");
    if (agent) throw new TriggerError(`unexpected argument ${token}`, "invalid");
    agent = token;
  }

  if (!agent) throw new TriggerError("agent is required", "invalid");
  if (!AGENT_NAME.test(agent)) throw new TriggerError("agent must match [a-z][a-z0-9_-]{0,31}", "invalid");
  if (kind !== "codex" && kind !== "claude") throw new TriggerError("kind must be codex or claude", "invalid");
  if (!pane) throw new TriggerError("pane is required", "invalid");
  let timeoutMs: number | undefined;
  if (timeout !== undefined) {
    timeoutMs = Number(timeout);
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 3000 || timeoutMs > 300_000) {
      throw new TriggerError("timeout must be an integer from 3001 to 300000", "invalid");
    }
  }
  return { agent, kind, pane, cwd, worktree, timeoutMs, yolo, attach, serve, json, extra };
}

export function spawnDetached(args: string[], env: NodeJS.ProcessEnv = process.env): number {
  const entry = process.argv[1];
  if (!entry) throw new TriggerError("cannot locate the trigger CLI entrypoint", "unavailable");
  const child = spawn(process.execPath, [entry, ...args], {
    detached: true,
    stdio: "ignore",
    env,
  });
  child.unref();
  if (!child.pid) throw new TriggerError("failed to detach process", "unavailable");
  return child.pid;
}

export async function ensureTriggerService(options: {
  url: string;
  spawnServe: () => number;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (await probeService(options.url, fetchImpl)) return;
  options.spawnServe();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await probeService(options.url, fetchImpl)) return;
  }
  throw new TriggerError(`trigger service did not become ready at ${options.url}`, "unavailable");
}

export async function runAgentStart(options: {
  args: StartArgs;
  env?: NodeJS.ProcessEnv;
  runner?: HerdrRunner;
  serviceUrl?: string;
  spawnServe?: () => number;
  spawnAttach?: (agent: string, kind: AgentKind) => number;
  fetchImpl?: typeof fetch;
}): Promise<{
  herdrArgs: string[];
  started: boolean;
  attached: boolean;
  service: string | null;
  branch: string | null;
  cwd: string | null;
  worktree: string | null;
}> {
  const env = options.env ?? process.env;
  const args = options.args;
  const spec: HerdrStartSpec = {
    agent: args.agent,
    kind: args.kind,
    pane: args.pane,
    timeoutMs: args.timeoutMs,
    extra: args.extra,
    yolo: args.yolo,
  };
  const herdrArgs = herdrStartArgs(spec);
  const serviceUrl = options.serviceUrl ?? defaultServiceUrl(env);
  if (args.serve) {
    await ensureTriggerService({
      url: serviceUrl,
      spawnServe:
        options.spawnServe ??
        (() => spawnDetached(["trigger", "serve"], env)),
      fetchImpl: options.fetchImpl,
    });
  }
  const runner = options.runner ?? createHerdrRunner(env.HERDR_BIN, env);
  const result = await runner.start(spec);
  const started = herdrStarted(result);
  if (!started) {
    const detail = (result.stderr || result.stdout || "herdr agent start failed").trim();
    throw new TriggerError(detail, "unavailable");
  }
  let snap: HerdrSnapshot | null = null;
  try {
    snap = await runner.get(args.agent);
  } catch {
    snap = null;
  }
  const place = sessionPlace(snap, { kind: args.kind, cwd: args.cwd, worktree: args.worktree });
  const store = new TriggerStore(resolveTriggerLocation(env).dbPath);
  try {
    store.recordSession({
      agent: args.agent,
      kind: place.kind ?? args.kind,
      branch: place.branch,
      cwd: place.cwd,
      worktree: place.worktree,
    });
  } finally {
    store.close();
  }
  let attached = false;
  if (args.attach) {
    const spawnAttach =
      options.spawnAttach ??
      ((agent: string, kind: AgentKind) => {
        const attachArgs = ["trigger", "attach", agent, "--kind", kind, "--background"];
        if (args.cwd) attachArgs.push("--cwd", args.cwd);
        if (args.worktree) attachArgs.push("--worktree", args.worktree);
        return spawnDetached(attachArgs, env);
      });
    spawnAttach(args.agent, args.kind);
    attached = true;
  }
  return {
    herdrArgs,
    started,
    attached,
    service: args.serve ? serviceUrl : null,
    branch: place.branch,
    cwd: place.cwd,
    worktree: place.worktree,
  };
}
