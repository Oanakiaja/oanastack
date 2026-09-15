import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { UsageError } from "../errors.js";
import { WORKTRUNK_INSTALL_HINT } from "../version.js";

const execFileAsync = promisify(execFile);

export interface WorktreeCreateOptions {
  repo: string;
  name: string;
  base?: string;
}

export interface WorktreeCreateResult {
  name: string;
  path: string;
  repo: string;
  base: string;
}

export interface WorktreeRemoveOptions {
  repo: string;
  name: string;
  force?: boolean;
}

export interface WorktreeRemoveResult {
  name: string;
  path?: string;
  repo: string;
  forced: boolean;
}

export interface WorktreeListItem {
  name: string;
  path: string;
}

export interface WorktreeListResult {
  repo: string;
  worktrees: WorktreeListItem[];
}

/**
 * Resolve the Worktrunk binary. Prefer WORKTRUNK_BIN (the shell may wrap `wt`
 * as a function). Otherwise use `command -v wt` and keep only an absolute path.
 */
export function worktrunkBin(): string {
  const override = process.env.WORKTRUNK_BIN?.trim();
  if (override) {
    return override;
  }
  try {
    const stdout = execFileSync("/bin/sh", ["-c", "command -v wt"], { encoding: "utf8" });
    const resolved = stdout.trim().split("\n")[0]?.trim();
    if (resolved?.startsWith("/")) {
      return resolved;
    }
  } catch {
    // fall through to PATH lookup
  }
  return "wt";
}

export function sanitizeWorktreeName(name: string): string {
  const slug = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug || slug === "." || slug === ".." || slug.includes("..")) {
    throw new UsageError(`Invalid worktree name "${name}"`);
  }
  return slug;
}

function assertGitRepo(repo: string): string {
  const resolved = path.resolve(repo);
  if (!existsSync(path.join(resolved, ".git"))) {
    throw new UsageError(`Not a git repository: ${resolved}`);
  }
  return resolved;
}

function commandErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const err = error as { message?: string; stderr?: string; stdout?: string };
    return [err.stderr, err.stdout, err.message].filter(Boolean).join("\n");
  }
  return String(error);
}

function isMissingWorktrunk(error: unknown, bin: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const err = error as NodeJS.ErrnoException;
  if (err.code === "ENOENT") {
    return true;
  }
  const message = commandErrorMessage(error);
  return message.includes("ENOENT") || message.includes(`spawn ${bin}`);
}

function missingWorktrunkError(): UsageError {
  return new UsageError(
    `Worktrunk (wt) is required for worktree commands. Install it with: ${WORKTRUNK_INSTALL_HINT}\nOr set WORKTRUNK_BIN to the wt executable.`,
  );
}

async function runWorktrunk(repo: string, args: string[]): Promise<string> {
  const bin = worktrunkBin();
  const argv = ["-C", repo, ...args];
  try {
    const { stdout } = await execFileAsync(bin, argv, {
      encoding: "utf8",
      cwd: repo,
    });
    return stdout;
  } catch (error) {
    if (isMissingWorktrunk(error, bin)) {
      throw missingWorktrunkError();
    }
    throw new UsageError(`wt ${args.join(" ")} failed: ${commandErrorMessage(error)}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function itemPath(item: unknown): string | undefined {
  const record = asRecord(item);
  if (!record) {
    return undefined;
  }
  if (typeof record.path === "string" && record.path.length > 0) {
    return record.path;
  }
  const worktree = asRecord(record.worktree);
  if (typeof worktree?.path === "string" && worktree.path.length > 0) {
    return worktree.path;
  }
  if (typeof record.worktree_path === "string" && record.worktree_path.length > 0) {
    return record.worktree_path;
  }
  return undefined;
}

function itemName(item: unknown): string | undefined {
  const record = asRecord(item);
  if (!record) {
    return undefined;
  }
  if (typeof record.branch === "string" && record.branch.length > 0) {
    return record.branch;
  }
  if (typeof record.name === "string" && record.name.length > 0) {
    return record.name;
  }
  return undefined;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function parseWorktrunkList(stdout: string): WorktreeListItem[] {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }
  const parsed = JSON.parse(trimmed) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(asRecord(parsed)?.items)
      ? (asRecord(parsed)?.items as unknown[])
      : [];
  const worktrees: WorktreeListItem[] = [];
  for (const row of rows) {
    const dest = itemPath(row);
    const name = itemName(row);
    if (!dest || !name) {
      continue;
    }
    worktrees.push({ name, path: dest });
  }
  return worktrees;
}

export function parseWorktrunkPath(stdout: string): string | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return undefined;
  }
  if (looksLikeJson(trimmed)) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parseWorktrunkList(trimmed)[0]?.path;
    }
    return itemPath(parsed) ?? parseWorktrunkList(JSON.stringify({ items: [parsed] }))[0]?.path;
  }
  return trimmed.split("\n").map((line) => line.trim()).find((line) => line.length > 0);
}

export async function listWorktrees(options: { repo: string }): Promise<WorktreeListResult> {
  const repo = assertGitRepo(options.repo);
  let stdout: string;
  try {
    stdout = await runWorktrunk(repo, ["list", "--format", "json"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/--format|unknown argument|unexpected argument/i.test(message)) {
      stdout = await runWorktrunk(repo, ["list"]);
    } else {
      throw error;
    }
  }
  if (!looksLikeJson(stdout)) {
    return { repo, worktrees: [] };
  }
  return { repo, worktrees: parseWorktrunkList(stdout) };
}

export async function resolveWorktree(options: { repo: string; name: string }): Promise<WorktreeListItem | undefined> {
  const name = sanitizeWorktreeName(options.name);
  const listed = await listWorktrees({ repo: options.repo });
  return listed.worktrees.find((entry) => entry.name === name);
}

export async function createWorktree(options: WorktreeCreateOptions): Promise<WorktreeCreateResult> {
  const repo = assertGitRepo(options.repo);
  const name = sanitizeWorktreeName(options.name);
  const base = options.base?.trim() || "HEAD";
  const existing = await resolveWorktree({ repo, name });
  if (existing) {
    return { name, path: existing.path, repo, base };
  }
  const args = ["switch", "--create", "--no-cd", "--format", "json", name];
  if (options.base?.trim()) {
    args.push("-b", options.base.trim());
  }
  const stdout = await runWorktrunk(repo, args);
  const dest = parseWorktrunkPath(stdout);
  if (!dest) {
    throw new UsageError(`wt switch --create ${name} did not print a worktree path`);
  }
  return { name, path: dest, repo, base };
}

export async function ensureWorktree(options: WorktreeCreateOptions): Promise<WorktreeCreateResult> {
  return createWorktree(options);
}

export async function removeWorktree(options: WorktreeRemoveOptions): Promise<WorktreeRemoveResult> {
  const repo = assertGitRepo(options.repo);
  const name = sanitizeWorktreeName(options.name);
  const args = ["remove", "--format", "json"];
  if (options.force) {
    args.push("--force");
  }
  args.push(name);
  const stdout = await runWorktrunk(repo, args);
  return { name, path: parseWorktrunkPath(stdout), repo, forced: Boolean(options.force) };
}
