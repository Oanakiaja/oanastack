import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { StoreError } from "./errors.js";

const SHA_RE = /^[0-9a-f]{7,64}$/i;

export interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function git(cwd: string, args: string[], options?: { allowFail?: boolean; env?: NodeJS.ProcessEnv }): GitResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: childEnv(options?.env),
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new StoreError("git is not installed", "invalid");
    throw new StoreError(`git ${args[0] ?? ""}: ${result.error.message}`, "invalid");
  }
  const status = result.status ?? 1;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (status !== 0 && !options?.allowFail) {
    throw new StoreError(`git ${args.join(" ")} failed: ${tail(stderr || stdout)}`, "invalid");
  }
  return { status, stdout, stderr };
}

/** Current commit of a worktree. Null when the path is not a git checkout. */
export function headSha(cwd: string | null | undefined): string | null {
  if (!cwd || !existsSync(cwd)) return null;
  const result = git(cwd, ["rev-parse", "HEAD"], { allowFail: true });
  if (result.status !== 0) return null;
  const sha = result.stdout.trim().toLowerCase();
  return SHA_RE.test(sha) ? sha : null;
}

export function gitTopLevel(dir: string): string | null {
  const result = git(dir, ["rev-parse", "--show-toplevel"], { allowFail: true });
  if (result.status !== 0) return null;
  const top = result.stdout.trim();
  return top || null;
}

export function refExists(repo: string, ref: string): boolean {
  const result = git(repo, ["show-ref", "--verify", "--quiet", ref], { allowFail: true });
  return result.status === 0;
}

export function hasOrigin(repo: string): boolean {
  const result = git(repo, ["remote", "get-url", "origin"], { allowFail: true });
  return result.status === 0 && result.stdout.trim() !== "";
}

export function defaultBranch(repo: string): string {
  const remote = git(repo, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { allowFail: true });
  if (remote.status === 0) {
    const name = remote.stdout.trim().replace(/^origin\//, "");
    if (name) return name;
  }
  const current = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true });
  if (current.status === 0) {
    const name = current.stdout.trim();
    if (name && name !== "HEAD") return name;
  }
  return "main";
}

export interface CommitSummary {
  sha: string;
  short: string;
  subject: string;
}

/** Recent commits on any local branch. Does not fetch. */
export function recentCommits(repo: string, limit = 40): CommitSummary[] {
  const result = git(repo, ["log", "-n", String(limit), "--all", "--format=%H%x09%h%x09%s"], { allowFail: true });
  if (result.status !== 0) return [];
  const commits: CommitSummary[] = [];
  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue;
    const [sha, short, ...rest] = line.split("\t");
    if (!sha || !short) continue;
    commits.push({ sha, short, subject: rest.join("\t") });
  }
  return commits;
}

export function listBranches(repo: string): string[] {
  const names = new Set<string>();
  for (const spec of ["refs/heads", "refs/remotes/origin"]) {
    const listed = git(repo, ["for-each-ref", "--format=%(refname:short)", spec], { allowFail: true });
    if (listed.status !== 0) continue;
    for (const line of listed.stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "origin" || trimmed.endsWith("/HEAD")) continue;
      names.add(trimmed.replace(/^origin\//, ""));
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function resolveStartPoint(repo: string, base: string): string {
  if (refExists(repo, `refs/heads/${base}`)) return base;
  if (refExists(repo, `refs/remotes/origin/${base}`)) return `origin/${base}`;
  throw new StoreError(`base branch not found: ${base}`, "invalid");
}

export function prepareBase(repo: string, base: string): string {
  if (hasOrigin(repo)) {
    const fetched = git(repo, ["fetch", "origin"], { allowFail: true });
    if (fetched.status !== 0) {
      throw new StoreError(`git fetch origin failed in ${repo}: ${tail(fetched.stderr || fetched.stdout)}`, "invalid");
    }
  }
  if (refExists(repo, `refs/remotes/origin/${base}`)) return `origin/${base}`;
  if (refExists(repo, `refs/heads/${base}`)) return base;
  throw new StoreError(`base branch not found: ${base}`, "invalid");
}

export function isClean(worktree: string): boolean {
  const result = git(worktree, ["status", "--porcelain"]);
  return result.stdout.trim() === "";
}

export function isAncestor(repo: string, ancestor: string, descendant: string): boolean {
  const result = git(repo, ["merge-base", "--is-ancestor", ancestor, descendant], { allowFail: true });
  return result.status === 0;
}

export function tail(text: string): string {
  return text
    .trim()
    .split("\n")
    .slice(-12)
    .join("\n")
    .trim();
}

function childEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_MERGE_AUTOEDIT: "no",
  };
}
