import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { integer, integerOrNull, openDatabase, rowId, rows, text, textOrNull } from "./db.js";
import { StoreError } from "./errors.js";
import {
  FEATURE_STATUSES,
  RESULT_STATUSES,
  type AddFeatureInput,
  type AddProjectInput,
  type AddRepoInput,
  type AddRoundInput,
  type AddTargetInput,
  type Completion,
  type CompletionInput,
  type Feature,
  type FeatureRepoLink,
  type FeatureStatus,
  type LinkTargetInput,
  type Overview,
  type Progress,
  type Project,
  type Repo,
  type ResultInput,
  type Round,
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
  line: 200,
  path: 1_000,
  branch: 200,
  herdrStatus: 80,
  herdrResult: 8_000,
  body: 20_000,
  goal: 4_000,
  test: 1_000,
  pr: 1_000,
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
  featureId: number | null;
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

interface FeatureRow {
  id: number;
  projectId: number;
  slug: string;
  status: FeatureStatus;
  goal: string | null;
  workspacePath: string | null;
  archivePath: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FeatureRepoRow {
  id: number;
  featureId: number;
  repoId: number;
  baseBranch: string;
  branch: string;
  worktreePath: string | null;
  prUrl: string | null;
}

export class Store {
  readonly path: string;
  readonly root: string;
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync, dbPath: string, root?: string) {
    this.db = db;
    this.path = dbPath;
    this.root = root ?? (dbPath === ":memory:" ? "" : path.dirname(dbPath));
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

  addRepo(input: AddRepoInput): Repo {
    const name = requireSlug(input.name);
    const repoPath = requireText(input.path, "path", LIMITS.path);
    if (!path.isAbsolute(repoPath)) throw new StoreError("repo path must be absolute", "invalid");
    const testCommand = optionalText(input.testCommand, "test", LIMITS.test);
    const now = iso();
    try {
      const info = this.db
        .prepare("INSERT INTO repos (name, path, test_command, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(name, repoPath, testCommand, now, now);
      const repo = this.repoRows().find((item) => item.id === rowId(info.lastInsertRowid));
      if (!repo) throw new StoreError("repo not found after insert", "not_found");
      return repo;
    } catch (error) {
      if (isUnique(error)) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("repos.path")) throw new StoreError(`repo path already registered: ${repoPath}`, "conflict");
        throw new StoreError(`repo already exists: ${name}`, "conflict");
      }
      throw error;
    }
  }

  listRepos(): Repo[] {
    return this.repoRows();
  }

  getRepo(name: string): Repo {
    const normalized = requireSlug(name);
    const repo = this.repoRows().find((item) => item.name === normalized);
    if (!repo) throw new StoreError(`repo not found: ${normalized}`, "not_found");
    return repo;
  }

  addFeature(input: AddFeatureInput): Feature {
    const project = this.projectBySlug(input.project);
    const slug = requireSlug(input.slug);
    const goal = optionalText(input.goal, "goal", LIMITS.goal);
    const workspacePath = requireText(input.workspacePath, "workspace", LIMITS.path);
    if (input.repos.length === 0) throw new StoreError("feature needs at least one repo", "invalid");
    const now = iso();
    const seen = new Set<number>();
    const links = input.repos.map((item) => {
      const repo = this.getRepo(item.repo);
      if (seen.has(repo.id)) throw new StoreError(`repo listed twice: ${repo.name}`, "invalid");
      seen.add(repo.id);
      return {
        repo,
        baseBranch: requireText(item.baseBranch, "base", LIMITS.branch),
        branch: requireText(item.branch, "branch", LIMITS.branch),
        worktreePath: requireText(item.worktreePath, "worktree", LIMITS.path),
      };
    });
    this.db.exec("BEGIN");
    let featureId = 0;
    try {
      const info = this.db
        .prepare(
          `INSERT INTO features (project_id, slug, status, goal, workspace_path, created_at, updated_at)
           VALUES (?, ?, 'open', ?, ?, ?, ?)`,
        )
        .run(project.id, slug, goal, workspacePath, now, now);
      featureId = rowId(info.lastInsertRowid);
      const insertLink = this.db.prepare(
        `INSERT INTO feature_repos (feature_id, repo_id, base_branch, branch, worktree_path)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const link of links) {
        insertLink.run(featureId, link.repo.id, link.baseBranch, link.branch, link.worktreePath);
      }
      this.touchProject(project.id, now);
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // Already committed or already rolled back.
      }
      if (isUnique(error)) {
        throw new StoreError(`feature already exists: ${project.slug}/${slug}`, "conflict");
      }
      throw error;
    }
    return this.requireFeature(featureId);
  }

  deleteFeature(id: number): void {
    this.db.prepare("DELETE FROM features WHERE id = ?").run(id);
  }

  listFeatures(projectSlug?: string): Feature[] {
    if (projectSlug !== undefined) return this.getProject(projectSlug).features;
    return this.group(this.projectRows()).flatMap((project) => project.features);
  }

  getFeature(projectSlug: string, featureSlug: string): Feature {
    const project = this.getProject(projectSlug);
    const slug = requireSlug(featureSlug);
    const feature = project.features.find((item) => item.slug === slug);
    if (!feature) throw new StoreError(`feature not found: ${project.slug}/${slug}`, "not_found");
    return feature;
  }

  findFeature(slug: string, projectSlug?: string | null): Feature {
    if (projectSlug) return this.getFeature(projectSlug, slug);
    const normalized = requireSlug(slug);
    const matches = this.listFeatures().filter((feature) => feature.slug === normalized);
    if (matches.length === 0) throw new StoreError(`feature not found: ${normalized}`, "not_found");
    if (matches.length > 1) {
      throw new StoreError(`feature ${normalized} is in multiple projects; pass --project`, "invalid");
    }
    const found = matches[0];
    if (!found) throw new StoreError(`feature not found: ${normalized}`, "not_found");
    return found;
  }

  getFeatureById(id: number): Feature {
    return this.requireFeature(id);
  }

  setFeatureStatus(id: number, status: FeatureStatus): Feature {
    requireFeatureStatus(status);
    const now = iso();
    const info = this.db.prepare("UPDATE features SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
    if (changeCount(info.changes) === 0) throw new StoreError(`feature not found: ${id}`, "not_found");
    const feature = this.requireFeature(id);
    this.touchProject(feature.projectId, now);
    return this.requireFeature(id);
  }

  setFeatureRepoPr(featureId: number, repoId: number, prUrl: string): void {
    const url = requireText(prUrl, "pr", LIMITS.pr);
    const now = iso();
    const info = this.db
      .prepare("UPDATE feature_repos SET pr_url = ? WHERE feature_id = ? AND repo_id = ?")
      .run(url, featureId, repoId);
    if (changeCount(info.changes) === 0) throw new StoreError("feature repo not found", "not_found");
    this.db.prepare("UPDATE features SET updated_at = ? WHERE id = ?").run(now, featureId);
  }

  closeFeatureRecord(id: number, status: "done" | "abandoned", archivePath: string): Feature {
    const archive = requireText(archivePath, "archive", LIMITS.path);
    const now = iso();
    const info = this.db
      .prepare("UPDATE features SET status = ?, workspace_path = NULL, archive_path = ?, updated_at = ? WHERE id = ?")
      .run(status, archive, now, id);
    if (changeCount(info.changes) === 0) throw new StoreError(`feature not found: ${id}`, "not_found");
    this.db.prepare("UPDATE feature_repos SET worktree_path = NULL WHERE feature_id = ?").run(id);
    const feature = this.requireFeature(id);
    this.touchProject(feature.projectId, now);
    return this.requireFeature(id);
  }

  addTarget(input: AddTargetInput): Target {
    const project = this.projectBySlug(input.project);
    const title = requireText(input.title, "title", LIMITS.title);
    let worktreePath = optionalText(input.worktreePath, "worktree", LIMITS.path);
    let branch = optionalText(input.branch, "branch", LIMITS.branch);
    const linked = this.resolveFeatureLink(project, input.feature, input.repo);
    if (linked.link) {
      if (worktreePath === null) worktreePath = linked.link.worktreePath;
      if (branch === null) branch = linked.link.branch;
    }
    const now = iso();
    const info = this.db
      .prepare(
        `INSERT INTO targets (
          project_id, feature_id, title, status, worktree_path, branch, created_at, updated_at
        ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?)`,
      )
      .run(project.id, linked.featureId, title, worktreePath, branch, now, now);
    this.touchProject(project.id, now);
    return this.requireTarget(rowId(info.lastInsertRowid));
  }

  linkTarget(id: number, input: LinkTargetInput): Target {
    const current = this.targetRow(id);
    if (!current) throw new StoreError(`target not found: ${id}`, "not_found");
    const project = this.projectRows().find((item) => item.id === current.projectId);
    if (!project) throw new StoreError(`project not found: ${current.projectId}`, "not_found");
    if (input.project && requireSlug(input.project) !== project.slug) {
      throw new StoreError(`target ${id} is in ${project.slug}, not ${input.project}`, "invalid");
    }
    const linked = this.resolveFeatureLink(project, input.feature, input.repo);
    if (linked.featureId === null) throw new StoreError("feature is required", "invalid");
    let worktreePath = current.worktreePath;
    let branch = current.branch;
    if (linked.link) {
      if (worktreePath === null) worktreePath = linked.link.worktreePath;
      if (branch === null) branch = linked.link.branch;
    }
    const now = iso();
    this.db
      .prepare("UPDATE targets SET feature_id = ?, worktree_path = ?, branch = ?, updated_at = ? WHERE id = ?")
      .run(linked.featureId, worktreePath, branch, now, id);
    this.touchProject(project.id, now);
    return this.requireTarget(id);
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

  addRound(input: AddRoundInput): Round {
    const feature = this.getFeature(input.project, input.feature);
    const name = requireSlug(input.repo);
    const link = feature.repos.find((repo) => repo.name === name);
    if (!link) throw new StoreError(`repo not on feature: ${name}`, "not_found");
    const instruction = requireText(input.instruction, "instruction", LIMITS.body);
    const reply = requireText(input.reply, "reply", LIMITS.body);
    const summary = optionalText(input.summary, "summary", LIMITS.line) ?? clipLine(instruction);
    const outcome = optionalText(input.outcome, "outcome", LIMITS.line) ?? clipLine(reply);
    const tools = optionalText(input.tools, "tools", LIMITS.body);
    const now = iso();
    const info = this.db
      .prepare(
        `INSERT INTO rounds (feature_repo_id, summary, outcome, instruction, reply, tools, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(link.id, summary, outcome, instruction, reply, tools, now);
    const created = this.roundRows().find((round) => round.id === rowId(info.lastInsertRowid));
    if (!created) throw new StoreError("round not found after insert", "not_found");
    return created;
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
    if (!completion) throw new StoreError("completion not found after insert", "not_found");
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
      root: this.root,
      repos: this.listRepos(),
      projects,
      progress: progressOf(projects.flatMap((project) => project.targets.map((target) => target.status))),
    };
  }

  private resolveFeatureLink(
    project: ProjectRow,
    featureSlug: string | null | undefined,
    repoName: string | null | undefined,
  ): { featureId: number | null; link: FeatureRepoLink | undefined } {
    if (!featureSlug) {
      if (repoName) throw new StoreError("--repo requires --feature", "invalid");
      return { featureId: null, link: undefined };
    }
    const feature = this.findFeature(featureSlug, project.slug);
    if (feature.projectId !== project.id) {
      throw new StoreError(`feature ${feature.slug} is not in ${project.slug}`, "invalid");
    }
    if (repoName) {
      const name = requireSlug(repoName);
      const link = feature.repos.find((item) => item.name === name);
      if (!link) throw new StoreError(`repo is not on this feature: ${name}`, "not_found");
      return { featureId: feature.id, link };
    }
    return { featureId: feature.id, link: feature.repos.length === 1 ? feature.repos[0] : undefined };
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

  private requireFeature(id: number): Feature {
    const feature = this.listFeatures().find((item) => item.id === id);
    if (!feature) throw new StoreError(`feature not found: ${id}`, "not_found");
    return feature;
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

  private repoRows(): Repo[] {
    return rows(this.db.prepare("SELECT * FROM repos ORDER BY name ASC, id ASC")).map((row) => ({
      id: integer(row, "id"),
      name: text(row, "name"),
      path: text(row, "path"),
      testCommand: textOrNull(row, "test_command"),
      createdAt: text(row, "created_at"),
      updatedAt: text(row, "updated_at"),
    }));
  }

  private featureRows(): FeatureRow[] {
    return rows(this.db.prepare("SELECT * FROM features ORDER BY id ASC")).map((row) => ({
      id: integer(row, "id"),
      projectId: integer(row, "project_id"),
      slug: text(row, "slug"),
      status: asFeatureStatus(text(row, "status")),
      goal: textOrNull(row, "goal"),
      workspacePath: textOrNull(row, "workspace_path"),
      archivePath: textOrNull(row, "archive_path"),
      createdAt: text(row, "created_at"),
      updatedAt: text(row, "updated_at"),
    }));
  }

  private featureRepoRows(): FeatureRepoRow[] {
    return rows(this.db.prepare("SELECT * FROM feature_repos ORDER BY id ASC")).map((row) => ({
      id: integer(row, "id"),
      featureId: integer(row, "feature_id"),
      repoId: integer(row, "repo_id"),
      baseBranch: text(row, "base_branch"),
      branch: text(row, "branch"),
      worktreePath: textOrNull(row, "worktree_path"),
      prUrl: textOrNull(row, "pr_url"),
    }));
  }

  private targetRows(): TargetRow[] {
    return rows(this.db.prepare("SELECT * FROM targets ORDER BY id ASC")).map((row) => ({
      id: integer(row, "id"),
      projectId: integer(row, "project_id"),
      featureId: integerOrNull(row, "feature_id"),
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

  private roundRows(): Round[] {
    return rows(this.db.prepare("SELECT * FROM rounds ORDER BY id DESC")).map((row) => ({
      id: integer(row, "id"),
      featureRepoId: integer(row, "feature_repo_id"),
      summary: text(row, "summary"),
      outcome: text(row, "outcome"),
      instruction: text(row, "instruction"),
      reply: text(row, "reply"),
      tools: textOrNull(row, "tools"),
      createdAt: text(row, "created_at"),
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
    const features = this.featureRows();
    const links = this.featureRepoRows();
    const repos = this.repoRows();
    const rounds = this.roundRows();
    const featureSlugById = new Map(features.map((feature) => [feature.id, feature.slug]));
    return projects.map((project) => {
      const projectTargets = targets
        .filter((target) => target.projectId === project.id)
        .map((target) => ({
          ...target,
          projectSlug: project.slug,
          featureSlug: target.featureId === null ? null : (featureSlugById.get(target.featureId) ?? null),
          completions: completions.filter((completion) => completion.targetId === target.id),
        }));
      const projectFeatures = features
        .filter((feature) => feature.projectId === project.id)
        .map((feature) => ({
          ...feature,
          projectSlug: project.slug,
          repos: links
            .filter((link) => link.featureId === feature.id)
            .map((link) => {
              const repo = repos.find((item) => item.id === link.repoId);
              if (!repo) throw new StoreError(`repo missing for feature ${feature.slug}`, "invalid");
              return {
                id: link.id,
                repoId: repo.id,
                name: repo.name,
                path: repo.path,
                testCommand: repo.testCommand,
                baseBranch: link.baseBranch,
                branch: link.branch,
                worktreePath: link.worktreePath,
                prUrl: link.prUrl,
                rounds: rounds.filter((round) => round.featureRepoId === link.id),
              };
            }),
          targets: projectTargets.filter((target) => target.featureId === feature.id),
        }));
      return {
        ...project,
        progress: progressOf(projectTargets.map((target) => target.status)),
        features: projectFeatures,
        targets: projectTargets,
      };
    });
  }
}

export function openStore(dbPath: string, root?: string): Store {
  return new Store(openDatabase(dbPath), dbPath, root);
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

export function assertSlug(slug: string): string {
  return requireSlug(slug);
}

function clipLine(value: string, max = 80): string {
  const line = value.replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
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

function requireFeatureStatus(status: string): FeatureStatus {
  if ((FEATURE_STATUSES as readonly string[]).includes(status)) return status as FeatureStatus;
  throw new StoreError("feature status must be open, review, done, or abandoned", "invalid");
}

function asStatus(value: string): TargetStatus {
  if (value === "open" || value === "success" || value === "failed" || value === "rejected") return value;
  throw new StoreError(`unknown target status: ${value}`, "invalid");
}

function asFeatureStatus(value: string): FeatureStatus {
  if (value === "open" || value === "review" || value === "done" || value === "abandoned") return value;
  throw new StoreError(`unknown feature status: ${value}`, "invalid");
}

function iso(): string {
  return new Date().toISOString();
}

function isUnique(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

function changeCount(changes: number | bigint): number {
  return typeof changes === "bigint" ? Number(changes) : changes;
}
