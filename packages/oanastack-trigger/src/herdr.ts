import { spawn } from "node:child_process";
import { TriggerError } from "./errors.js";
import type { AgentKind, AgentStatus, HerdrSnapshot } from "./types.js";
import { herdrStartArgs, type HerdrStartSpec } from "./yolo.js";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface HerdrRunner {
  get(agent: string): Promise<HerdrSnapshot | null>;
  read(agent: string, lines: number): Promise<string>;
  list(): Promise<HerdrSnapshot[]>;
  start(spec: HerdrStartSpec): Promise<CommandResult>;
}

export function createHerdrRunner(
  bin = process.env.HERDR_BIN?.trim() || "herdr",
  env: NodeJS.ProcessEnv = process.env,
): HerdrRunner {
  return {
    async get(agent) {
      const result = await run(bin, ["agent", "get", agent], env);
      if (result.code !== 0 && !result.stdout.trim()) return null;
      return parseAgentGet(result.stdout);
    },
    async read(agent, lines) {
      const result = await run(bin, ["agent", "read", agent, "--source", "recent-unwrapped", "--lines", String(lines)], env);
      if (result.code !== 0) return "";
      return result.stdout;
    },
    async list() {
      const result = await run(bin, ["agent", "list"], env);
      if (result.code !== 0) return [];
      return parseAgentList(result.stdout);
    },
    start(spec) {
      return run(bin, herdrStartArgs(spec), env);
    },
  };
}

export function parseAgentGet(raw: string): HerdrSnapshot | null {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const result = (parsed as { result?: unknown }).result;
  if (!result || typeof result !== "object") return null;
  const agent = (result as { agent?: unknown }).agent;
  if (!agent || typeof agent !== "object" || Array.isArray(agent)) return null;
  return snapshotFrom(agent as Record<string, unknown>);
}

export function parseAgentList(raw: string): HerdrSnapshot[] {
  const parsed = parseJson(raw);
  if (!parsed) return [];
  const agents = extractAgents(parsed);
  return agents.map(snapshotFrom).filter((item) => item.name || item.paneId);
}

export function herdrStarted(result: CommandResult): boolean {
  if (result.code === 0) return true;
  return /agent_not_ready/.test(`${result.stdout}\n${result.stderr}`);
}

export function run(bin: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new TriggerError(error.message, "unavailable"));
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function extractAgents(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed.filter(isRecord);
  if (!isRecord(parsed)) return [];
  if (Array.isArray(parsed.agents)) return parsed.agents.filter(isRecord);
  const result = parsed.result;
  if (Array.isArray(result)) return result.filter(isRecord);
  if (!isRecord(result)) return [];
  if (Array.isArray(result.agents)) return result.agents.filter(isRecord);
  if (isRecord(result.agent)) return [result.agent];
  return [];
}

function snapshotFrom(record: Record<string, unknown>): HerdrSnapshot {
  const kind = readKind(record);
  const name = readString(record, "name") ?? readString(record, "agent_name");
  return {
    name,
    kind,
    status: readStatus(record),
    cwd: readString(record, "foreground_cwd") ?? readString(record, "cwd"),
    worktree: readWorktree(record),
    paneId: readString(record, "pane_id") ?? readString(record, "paneId"),
    revision: typeof record.revision === "number" ? record.revision : null,
  };
}

function readKind(record: Record<string, unknown>): AgentKind | null {
  const candidates = [readString(record, "kind"), readString(record, "agent"), readString(record, "integration")];
  for (const value of candidates) {
    if (value === "codex" || value === "claude") return value;
  }
  return null;
}

function readStatus(record: Record<string, unknown>): AgentStatus | null {
  const value = (readString(record, "agent_status") ?? readString(record, "status"))?.toLowerCase() ?? null;
  if (value === "idle" || value === "working" || value === "blocked" || value === "done" || value === "unknown") {
    return value;
  }
  return null;
}

function readWorktree(record: Record<string, unknown>): string | null {
  const direct = readString(record, "worktree_path") ?? readString(record, "worktreePath");
  if (direct) return direct;
  const worktree = record.worktree;
  if (typeof worktree === "string" && worktree.trim()) return worktree.trim();
  if (isRecord(worktree)) return readString(worktree, "path");
  return null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
