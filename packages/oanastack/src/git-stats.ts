import { existsSync } from "node:fs";
import { filesUnder } from "./diff-tree.js";
import { git, refExists, tail } from "./git.js";

export interface WorktreeDistance {
  ahead: number | null;
  behind: number | null;
  added: number | null;
  removed: number | null;
  filesChanged: number | null;
  dirty: boolean;
  error: string | null;
}

export interface DiffFileStat {
  path: string;
  status: string;
  added: number;
  removed: number;
  binary: boolean;
}

export interface DiffRow {
  kind: "context" | "add" | "del" | "change";
  leftNo: number | null;
  rightNo: number | null;
  left: string | null;
  right: string | null;
}

export interface DiffSection {
  path: string;
  status: string;
  added: number;
  removed: number;
  binary: boolean;
  truncated: boolean;
  rows: DiffRow[];
}

export interface WorktreeDiff {
  base: string;
  head: string;
  dirty: boolean;
  files: DiffFileStat[];
  /** Sections included in this response. `all` or `dir` can return more than one. */
  sections: DiffSection[];
  sectionsTruncated: boolean;
  file: string | null;
  binary: boolean;
  truncated: boolean;
  rows: DiffRow[];
  error: string | null;
}

const SECTION_CAP = 40;

const ROW_CAP = 400;

/** Live distance of a feature branch from its base. Does not fetch. */
export function measureWorktree(input: {
  repoPath: string;
  worktreePath: string | null;
  baseBranch: string;
  branch: string;
}): WorktreeDistance {
  const empty: WorktreeDistance = {
    ahead: null,
    behind: null,
    added: null,
    removed: null,
    filesChanged: null,
    dirty: false,
    error: null,
  };
  const located = locate(input);
  if ("error" in located) return { ...empty, error: located.error };
  const counts = revList(located.cwd, located.base, located.head);
  if (counts.error) return { ...empty, dirty: located.dirty, error: counts.error };
  const stats = numstat(located);
  return {
    ahead: counts.ahead,
    behind: counts.behind,
    added: stats.added,
    removed: stats.removed,
    filesChanged: stats.files,
    dirty: located.dirty,
    error: stats.error,
  };
}

export function diffWorktree(
  input: {
    repoPath: string;
    worktreePath: string | null;
    baseBranch: string;
    branch: string;
  },
  file: string | undefined,
  scope?: { all?: boolean; dir?: string },
): WorktreeDiff {
  const located = locate(input);
  if ("error" in located) {
    return blankDiff(input.baseBranch, input.branch, located.error);
  }
  const files = listFiles(located);
  if (files.error) return { ...blankDiff(located.base, located.head, files.error), dirty: located.dirty };
  const pool = scope?.dir ? filesUnder(files.files, scope.dir) : files.files;
  const many = scope?.all === true || Boolean(scope?.dir);
  const targets = many ? pool.slice(0, SECTION_CAP) : pickOne(files.files, file);
  const sections = targets.map((item) => sectionFor(located, item));
  const focus = sections.find((item) => item.path === file) ?? sections.find((item) => !item.binary) ?? sections[0] ?? null;
  return {
    base: located.base,
    head: located.head,
    dirty: located.dirty,
    files: files.files,
    sections,
    sectionsTruncated: pool.length > targets.length,
    file: focus?.path ?? null,
    binary: focus?.binary ?? false,
    truncated: focus?.truncated ?? false,
    rows: focus?.rows ?? [],
    error: null,
  };
}

function pickOne(files: DiffFileStat[], file: string | undefined): DiffFileStat[] {
  const chosen = file && files.some((item) => item.path === file) ? file : (files.find((item) => !item.binary)?.path ?? files[0]?.path);
  const selected = chosen ? files.find((item) => item.path === chosen) : undefined;
  return selected ? [selected] : [];
}

function sectionFor(located: Located, file: DiffFileStat): DiffSection {
  if (file.binary) {
    return { path: file.path, status: file.status, added: file.added, removed: file.removed, binary: true, truncated: false, rows: [] };
  }
  const raw = git(located.cwd, ["diff", "--no-color", "--unified=3", "--find-renames", ...diffArgs(located), "--", file.path], { allowFail: true });
  if (raw.status !== 0) {
    return { path: file.path, status: file.status, added: file.added, removed: file.removed, binary: false, truncated: false, rows: [] };
  }
  const parsed = parseSideBySide(raw.stdout);
  return {
    path: file.path,
    status: file.status,
    added: file.added,
    removed: file.removed,
    binary: false,
    truncated: parsed.truncated,
    rows: parsed.rows,
  };
}

/** Turn a unified diff into left (base) / right (worktree) rows. */
export function parseSideBySide(unified: string): { rows: DiffRow[]; truncated: boolean } {
  const rows: DiffRow[] = [];
  let leftNo = 0;
  let rightNo = 0;
  let inHunk = false;
  let truncated = false;
  const dels: Array<{ no: number; text: string }> = [];
  const adds: Array<{ no: number; text: string }> = [];

  const flush = () => {
    const count = Math.max(dels.length, adds.length);
    for (let i = 0; i < count; i += 1) {
      if (rows.length >= ROW_CAP) {
        truncated = true;
        dels.length = 0;
        adds.length = 0;
        return;
      }
      const del = dels[i];
      const add = adds[i];
      rows.push({
        kind: del && add ? "change" : del ? "del" : "add",
        leftNo: del?.no ?? null,
        rightNo: add?.no ?? null,
        left: del?.text ?? null,
        right: add?.text ?? null,
      });
    }
    dels.length = 0;
    adds.length = 0;
  };

  for (const line of unified.split("\n")) {
    if (rows.length >= ROW_CAP) {
      truncated = true;
      break;
    }
    if (line.startsWith("@@")) {
      flush();
      inHunk = true;
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
      if (match?.[1] && match[2]) {
        leftNo = Number(match[1]);
        rightNo = Number(match[2]);
      }
      continue;
    }
    // A real blank context line is " ". An empty string is the trailing split from a final newline.
    if (!inHunk || line === "" || line.startsWith("\\")) continue;
    if (line.startsWith("-")) {
      if (adds.length > 0) flush();
      dels.push({ no: leftNo, text: line.slice(1) });
      leftNo += 1;
      continue;
    }
    if (line.startsWith("+")) {
      adds.push({ no: rightNo, text: line.slice(1) });
      rightNo += 1;
      continue;
    }
    flush();
    const text = line.startsWith(" ") ? line.slice(1) : line;
    rows.push({ kind: "context", leftNo, rightNo, left: text, right: text });
    leftNo += 1;
    rightNo += 1;
  }
  flush();
  return { rows, truncated };
}

interface Located {
  cwd: string;
  base: string;
  /** Set when the branch must be named. Null means diff the worktree working tree against base, and count commits from HEAD. */
  head: string;
  worktree: boolean;
  dirty: boolean;
}

function locate(input: {
  repoPath: string;
  worktreePath: string | null;
  baseBranch: string;
  branch: string;
}): Located | { error: string } {
  const worktree = input.worktreePath && existsSync(input.worktreePath) ? input.worktreePath : null;
  const cwd = worktree ?? input.repoPath;
  if (!existsSync(cwd)) return { error: `path missing: ${cwd}` };
  const base = resolveBaseRef(cwd, input.baseBranch);
  if (!base) return { error: `base branch not found: ${input.baseBranch}` };
  if (worktree) {
    return { cwd: worktree, base, head: "HEAD", worktree: true, dirty: !isCleanQuiet(worktree) };
  }
  if (!refExists(cwd, `refs/heads/${input.branch}`)) return { error: `branch not found: ${input.branch}` };
  return { cwd, base, head: input.branch, worktree: false, dirty: false };
}

function resolveBaseRef(cwd: string, base: string): string | null {
  if (refExists(cwd, `refs/remotes/origin/${base}`)) return `origin/${base}`;
  if (refExists(cwd, `refs/heads/${base}`)) return base;
  return null;
}

function isCleanQuiet(cwd: string): boolean {
  const result = git(cwd, ["status", "--porcelain"], { allowFail: true });
  return result.status === 0 && result.stdout.trim() === "";
}

function revList(cwd: string, base: string, head: string): { ahead: number; behind: number; error: string | null } {
  const result = git(cwd, ["rev-list", "--left-right", "--count", `${base}...${head}`], { allowFail: true });
  if (result.status !== 0) return { ahead: 0, behind: 0, error: tail(result.stderr || result.stdout) || "git rev-list failed" };
  const [behindRaw, aheadRaw] = result.stdout.trim().split(/\s+/);
  const behind = Number(behindRaw);
  const ahead = Number(aheadRaw);
  if (!Number.isInteger(behind) || !Number.isInteger(ahead)) {
    return { ahead: 0, behind: 0, error: "could not read ahead/behind" };
  }
  return { ahead, behind, error: null };
}

function diffArgs(located: Located): string[] {
  // Worktree: working tree versus the base commit, so uncommitted edits are included.
  // Closed worktree: the named branch versus the base.
  if (located.worktree) return [located.base];
  return [`${located.base}...${located.head}`];
}

function numstat(located: Located): { added: number; removed: number; files: number; error: string | null } {
  const result = git(located.cwd, ["diff", "--numstat", ...diffArgs(located)], { allowFail: true });
  if (result.status !== 0) return { added: 0, removed: 0, files: 0, error: tail(result.stderr || result.stdout) || "git diff failed" };
  let added = 0;
  let removed = 0;
  let files = 0;
  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue;
    files += 1;
    const [addRaw, delRaw] = line.split("\t");
    if (addRaw !== "-" && addRaw) added += Number(addRaw) || 0;
    if (delRaw !== "-" && delRaw) removed += Number(delRaw) || 0;
  }
  return { added, removed, files, error: null };
}

function listFiles(located: Located): { files: DiffFileStat[]; error: string | null } {
  const names = git(located.cwd, ["diff", "--name-status", "--find-renames", ...diffArgs(located)], { allowFail: true });
  if (names.status !== 0) return { files: [], error: tail(names.stderr || names.stdout) || "git diff failed" };
  const stats = git(located.cwd, ["diff", "--numstat", ...diffArgs(located)], { allowFail: true });
  const byPath = new Map<string, { added: number; removed: number; binary: boolean }>();
  if (stats.status === 0) {
    for (const line of stats.stdout.split("\n")) {
      if (!line.trim()) continue;
      const [addRaw, delRaw, ...rest] = line.split("\t");
      const rawPath = rest.join("\t");
      if (!rawPath || addRaw === undefined || delRaw === undefined) continue;
      const binary = addRaw === "-" || delRaw === "-";
      byPath.set(normalizeNumstatPath(rawPath), {
        added: binary ? 0 : Number(addRaw) || 0,
        removed: binary ? 0 : Number(delRaw) || 0,
        binary,
      });
    }
  }
  const files: DiffFileStat[] = [];
  for (const line of names.stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const status = parts[0] ?? "?";
    const path = status.startsWith("R") || status.startsWith("C") ? (parts[2] ?? parts[1] ?? "") : (parts[1] ?? "");
    if (!path) continue;
    const stat = byPath.get(path);
    files.push({
      path,
      status: status.slice(0, 1),
      added: stat?.added ?? 0,
      removed: stat?.removed ?? 0,
      binary: stat?.binary ?? false,
    });
  }
  return { files, error: null };
}

function normalizeNumstatPath(raw: string): string {
  const brace = /\{[^}]* => ([^}]*)\}/.exec(raw);
  if (brace?.[1] !== undefined) return raw.replace(/\{[^}]* => [^}]*\}/, brace[1]);
  const arrow = raw.split(" => ");
  return arrow.length === 2 ? (arrow[1] ?? raw) : raw;
}

function blankDiff(base: string, head: string, error: string): WorktreeDiff {
  return {
    base,
    head,
    dirty: false,
    files: [],
    sections: [],
    sectionsTruncated: false,
    file: null,
    binary: false,
    truncated: false,
    rows: [],
    error,
  };
}
