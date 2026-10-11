import type { DatabaseSync } from "node:sqlite";
import { integer, openDatabase, rowId, rows, text, textOrNull } from "./db.js";
import { StoreError } from "./errors.js";
import {
  RESULT_STATUSES,
  type AddProjectInput,
  type AddTargetInput,
  type Completion,
  type CompletionInput,
  type Overview,
  type Progress,
  type Project,
  type ResultInput,
  type ResultStatus,
  type Target,
  type TargetStatus,
} from "./types.js";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const LIMITS = {
  slug: 64,
  name: 120,
  note: 2_000,
  title: 200,
  summary: 4_000,
  path: 1_000,
  branch: 200,
  herdrStatus: 80,
  herdrResult: 8_000,
  body: 20_000,
} as const;

interface ProjectRow {
  id: number;
  slug: string;
  name: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TargetRow {
  id: number;
  projectId: number;
  title: string;
  status: TargetStatus;
  summary: string | null;
  worktreePath: string | null;
  branch: string | null;
  herdrStatus: string | null;
  herdrResult: string | null;
  createdAt: string;
  updatedAt: string;
}

export class Store {
  readonly path: string;
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync, dbPath: string) {
    this.db = db;
    this.path = dbPath;
  }

  close(): void {
    this.db.close();
  }

  addProject(input: AddProjectInput): Project {
    const slug = requireSlug(input.slug);
    const name = input.name === undefined || input.name === null ? slug : requireText(input.name, "name", LIMITS.name);
    const note = optionalText(input.note, "note", LIMITS.note);
    const now = iso();
    try {
      const info = this.db
        .prepare("INSERT INTO projects (slug, name, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(slug, name, note, now, now);
      return this.requireProject(rowId(info.lastInsertRowid));
    } catch (error) {
      if (isUnique(error)) {
        throw new StoreError(`project already exists: ${slug}`, "conflict");
      }
      throw error;
    }
  }

  addTarget(input: AddTargetInput): Target {
    const project = this.projectBySlug(input.project);
    const title = requireText(input.title, "title", LIMITS.title);
    const worktreePath = optionalText(input.worktreePath, "worktree", LIMITS.path);
    const branch = optionalText(input.branch, "branch", LIMITS.branch);
    const now = iso();
    const info = this.db
      .prepare(
        `INSERT INTO targets (
          project_id, title, status, worktree_path, branch, created_at, updated_at
        ) VALUES (?, ?, 'open', ?, ?, ?, ?)`,
      )
      .run(project.id, title, worktreePath, branch, now, now);
    this.touchProject(project.id, now);
    return this.requireTarget(rowId(info.lastInsertRowid));
  }

  setResult(id: number, input: ResultInput): Target {
    const status = requireResultStatus(input.status);
    const current = this.targetRow(id);
    if (!current) throw new StoreError(`target not found: ${id}`, "not_found");
    const summary = patchText(input.summary, "summary", LIMITS.summary);
    const worktreePath = patchText(input.worktreePath, "worktree", LIMITS.path);
    const branch = patchText(input.branch, "branch", LIMITS.branch);
    const herdrStatus = patchText(input.herdrStatus, "herdr-status", LIMITS.herdrStatus);
    const herdrResult = patchText(input.herdrResult, "herdr", LIMITS.herdrResult);
    const now = iso();
    this.db
      .prepare(
        `UPDATE targets
         SET status = ?, summary = ?, worktree_path = ?, branch = ?, herdr_status = ?, herdr_result = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        status,
        summary === undefined ? current.summary : summary,
        worktreePath === undefined ? current.worktreePath : worktreePath,
        branch === undefined ? current.branch : branch,
        herdrStatus === undefined ? current.herdrStatus : herdrStatus,
        herdrResult === undefined ? current.herdrResult : herdrResult,
        now,
        id,
      );
    this.touchProject(current.projectId, now);
    return this.requireTarget(id);
  }

  addCompletion(targetId: number, input: CompletionInput): Completion {
    const target = this.targetRow(targetId);
    if (!target) throw new StoreError(`target not found: ${targetId}`, "not_found");
    const changed = requireText(input.changed, "changed", LIMITS.body);
    const why = requireText(input.why, "why", LIMITS.body);
    const verified = requireText(input.verified, "verified", LIMITS.body);
    const risks = optionalText(input.risks, "risks", LIMITS.body);
    const review = optionalText(input.review, "check", LIMITS.body);
    const now = iso();
    const info = this.db
      .prepare(
        `INSERT INTO completions (target_id, changed, why, verified, risks, review, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(targetId, changed, why, verified, risks, review, now);
    this.touchProject(target.projectId, now);
    const completion = this.completionById(rowId(info.lastInsertRowid));
    if (!completion) throw new StoreError(`completion not found after insert`, "not_found");
    return completion;
  }

  getProject(slug: string): Project {
    const project = this.projectBySlug(slug);
    const grouped = this.group(this.projectRows().filter((item) => item.id === project.id));
    const found = grouped[0];
    if (!found) throw new StoreError(`project not found: ${slug}`, "not_found");
    return found;
  }

  listProjects(): Project[] {
    return this.group(this.projectRows());
  }

  getTarget(id: number): Target {
    return this.requireTarget(id);
  }

  listTargets(projectSlug?: string): Target[] {
    if (projectSlug !== undefined) {
      return this.getProject(projectSlug).targets;
    }
    return this.group(this.projectRows()).flatMap((project) => project.targets);
  }

  overview(): Overview {
    const projects = this.listProjects();
    return {
      dbPath: this.path,
      projects,
      progress: progressOf(projects.flatMap((project) => project.targets.map((target) => target.status))),
    };
  }

  private requireProject(id: number): Project {
    const project = this.group(this.projectRows().filter((item) => item.id === id))[0];
    if (!project) throw new StoreError(`project not found: ${id}`, "not_found");
    return project;
  }

  private requireTarget(id: number): Target {
    const target = this.listTargets().find((item) => item.id === id);
    if (!target) throw new StoreError(`target not found: ${id}`, "not_found");
    return target;
  }

  private projectBySlug(slug: string): ProjectRow {
    const normalized = requireSlug(slug);
    const found = this.projectRows().find((project) => project.slug === normalized);
    if (!found) throw new StoreError(`project not found: ${normalized}`, "not_found");
    return found;
  }

  private touchProject(id: number, now: string): void {
    this.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now, id);
  }

  private projectRows(): ProjectRow[] {
    return rows(this.db.prepare("SELECT * FROM projects ORDER BY updated_at DESC, id DESC")).map((row) => ({
      id: integer(row, "id"),
      slug: text(row, "slug"),
      name: text(row, "name"),
      note: textOrNull(row, "note"),
      createdAt: text(row, "created_at"),
      updatedAt: text(row, "updated_at"),
    }));
  }

  private targetRows(): TargetRow[] {
    return rows(this.db.prepare("SELECT * FROM targets ORDER BY id ASC")).map((row) => ({
      id: integer(row, "id"),
      projectId: integer(row, "project_id"),
      title: text(row, "title"),
      status: asStatus(text(row, "status")),
      summary: textOrNull(row, "summary"),
      worktreePath: textOrNull(row, "worktree_path"),
      branch: textOrNull(row, "branch"),
      herdrStatus: textOrNull(row, "herdr_status"),
      herdrResult: textOrNull(row, "herdr_result"),
      createdAt: text(row, "created_at"),
      updatedAt: text(row, "updated_at"),
    }));
  }

  private completionRows(): Completion[] {
    return rows(this.db.prepare("SELECT * FROM completions ORDER BY id DESC")).map((row) => ({
      id: integer(row, "id"),
      targetId: integer(row, "target_id"),
      changed: text(row, "changed"),
      why: text(row, "why"),
      verified: text(row, "verified"),
      risks: textOrNull(row, "risks"),
      review: textOrNull(row, "review"),
      createdAt: text(row, "created_at"),
    }));
  }

  private completionById(id: number): Completion | undefined {
    return this.completionRows().find((completion) => completion.id === id);
  }

  private targetRow(id: number): TargetRow | undefined {
    return this.targetRows().find((target) => target.id === id);
  }

  private group(projects: ProjectRow[]): Project[] {
    const targets = this.targetRows();
    const completions = this.completionRows();
    return projects.map((project) => {
      const projectTargets = targets
        .filter((target) => target.projectId === project.id)
        .map((target) => ({
          ...target,
          projectSlug: project.slug,
          completions: completions.filter((completion) => completion.targetId === target.id),
        }));
      return {
        ...project,
        progress: progressOf(projectTargets.map((target) => target.status)),
        targets: projectTargets,
      };
    });
  }
}

export function openStore(dbPath: string): Store {
  return new Store(openDatabase(dbPath), dbPath);
}

export function progressOf(statuses: TargetStatus[]): Progress {
  const progress: Progress = {
    total: statuses.length,
    open: 0,
    success: 0,
    failed: 0,
    rejected: 0,
    ratio: 0,
  };
  for (const status of statuses) {
    progress[status] += 1;
  }
  progress.ratio = progress.total === 0 ? 0 : Math.round((progress.success / progress.total) * 10000) / 10000;
  return progress;
}

function requireSlug(slug: string): string {
  const value = slug.trim();
  if (!SLUG_RE.test(value) || value.length > LIMITS.slug) {
    throw new StoreError("slug must be kebab-case (a-z, 0-9, hyphens), max 64", "invalid");
  }
  return value;
}

function requireText(value: string, field: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new StoreError(`${field} is required`, "invalid");
  if (trimmed.length > max) throw new StoreError(`${field} is too long`, "invalid");
  return trimmed;
}

function optionalText(value: string | null | undefined, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new StoreError(`${field} is too long`, "invalid");
  return trimmed;
}

function patchText(value: string | null | undefined, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  return optionalText(value, field, max);
}

function requireResultStatus(status: string): ResultStatus {
  if ((RESULT_STATUSES as readonly string[]).includes(status)) {
    return status as ResultStatus;
  }
  throw new StoreError("status must be success, failed, or rejected", "invalid");
}

function asStatus(value: string): TargetStatus {
  if (value === "open" || value === "success" || value === "failed" || value === "rejected") return value;
  throw new StoreError(`unknown target status: ${value}`, "invalid");
}

function iso(): string {
  return new Date().toISOString();
}

function isUnique(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}
