import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { StoreError } from "./errors.js";
import {
  defaultBranch,
  git,
  gitTopLevel,
  hasOrigin,
  isAncestor,
  isClean,
  listBranches,
  prepareBase,
  refExists,
  resolveStartPoint,
  tail,
} from "./git.js";
import { expandHome, featureArchive, featureWorkspace } from "./paths.js";
import { assertSlug, type Store } from "./store.js";
import type { Feature, FeatureRepoLink, Repo } from "./types.js";

export interface BrowseEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
  truncated: boolean;
}

export function registerRepo(
  store: Store,
  input: { name: string; path: string; testCommand?: string | null },
): Repo {
  const expanded = expandHome(input.path.trim());
  if (!path.isAbsolute(expanded)) throw new StoreError("repo path must be absolute", "invalid");
  let real: string;
  try {
    real = realpathSync(expanded);
  } catch {
    throw new StoreError(`repo path does not exist: ${expanded}`, "invalid");
  }
  if (!statSync(real).isDirectory()) throw new StoreError(`repo path is not a directory: ${real}`, "invalid");
  const top = gitTopLevel(real);
  if (!top) throw new StoreError(`not a git repository: ${real}`, "invalid");
  let topReal: string;
  try {
    topReal = realpathSync(top);
  } catch {
    topReal = top;
  }
  if (topReal !== real) throw new StoreError(`path is not the git toplevel; register ${topReal}`, "invalid");
  return store.addRepo({ name: input.name, path: topReal, testCommand: input.testCommand });
}

export function createFeature(
  store: Store,
  root: string,
  input: { project: string; slug: string; goal?: string | null; repos: Array<{ name: string; base: string }> },
): Feature {
  if (input.repos.length === 0) throw new StoreError("feature needs at least one repo", "invalid");
  const project = store.getProject(input.project);
  const slug = assertSlug(input.slug);
  if (input.goal && input.goal.trim().length > 4_000) throw new StoreError("goal is too long", "invalid");
  if (project.features.some((feature) => feature.slug === slug)) {
    throw new StoreError(`feature already exists: ${project.slug}/${slug}`, "conflict");
  }
  const names = new Set<string>();
  const resolved = input.repos.map((spec) => {
    const name = assertSlug(spec.name);
    const base = spec.base.trim();
    if (!base) throw new StoreError("each repo needs a base branch", "invalid");
    if (names.has(name)) throw new StoreError(`repo listed twice: ${name}`, "invalid");
    names.add(name);
    return { repo: store.getRepo(name), base };
  });
  const branch = `feature/${slug}`;
  for (const item of resolved) {
    if (refExists(item.repo.path, `refs/heads/${branch}`)) {
      throw new StoreError(`branch ${branch} already exists in ${item.repo.name}`, "conflict");
    }
  }
  const workspace = featureWorkspace(root, project.slug, slug);
  if (existsSync(workspace)) throw new StoreError(`feature workspace already exists: ${workspace}`, "conflict");
  const made: Array<{ repo: string; worktree: string; branch: string }> = [];
  let featureId: number | null = null;
  mkdirSync(workspace, { recursive: true });
  try {
    for (const item of resolved) {
      const dest = path.join(workspace, item.repo.name);
      const start = resolveStartPoint(item.repo.path, item.base);
      git(item.repo.path, ["worktree", "add", "-b", branch, dest, start]);
      made.push({ repo: item.repo.path, worktree: dest, branch });
    }
    mkdirSync(path.join(workspace, ".oanastack"), { recursive: true });
    writeFileSync(path.join(workspace, ".oanastack", "tasks.md"), tasksTemplate(slug, input.goal ?? null));
    const feature = store.addFeature({
      project: project.slug,
      slug,
      goal: input.goal ?? null,
      workspacePath: workspace,
      repos: resolved.map((item) => ({
        repo: item.repo.name,
        baseBranch: item.base,
        branch,
        worktreePath: path.join(workspace, item.repo.name),
      })),
    });
    featureId = feature.id;
    syncFeatureContext(store, feature.id);
    return store.getFeatureById(feature.id);
  } catch (error) {
    if (featureId !== null) {
      try {
        store.deleteFeature(featureId);
      } catch {
        // The row is already gone, or the original error is the one to surface.
      }
    }
    rollback(made, workspace);
    throw error;
  }
}

export function mergeFeature(
  store: Store,
  input: { project?: string | null; feature: string; local: boolean; env?: NodeJS.ProcessEnv },
): Feature {
  const feature = store.findFeature(input.feature, input.project);
  if (feature.status === "done" || feature.status === "abandoned") {
    throw new StoreError(`feature is already ${feature.status}`, "invalid");
  }
  if (!feature.workspacePath || !existsSync(feature.workspacePath)) {
    throw new StoreError("feature workspace is missing", "invalid");
  }
  const env = input.env ?? process.env;
  for (const link of feature.repos) {
    if (!link.worktreePath || !existsSync(link.worktreePath)) {
      throw new StoreError(`worktree is missing for ${link.name}`, "invalid");
    }
    const base = prepareBase(link.path, link.baseBranch);
    const merged = git(link.worktreePath, ["merge", "--no-edit", base], { allowFail: true, env });
    if (merged.status !== 0) {
      git(link.worktreePath, ["merge", "--abort"], { allowFail: true, env });
      throw new StoreError(
        `merging ${base} into ${link.branch} failed in ${link.name}: ${tail(merged.stderr || merged.stdout)}`,
        "invalid",
      );
    }
    if (link.testCommand) runTests(link, env);
    if (input.local) localMerge(link, env);
    else store.setFeatureRepoPr(feature.id, link.repoId, pushAndPr(link, feature, env));
  }
  store.setFeatureStatus(feature.id, "review");
  syncFeatureContext(store, feature.id);
  return store.getFeatureById(feature.id);
}

export function closeFeature(
  store: Store,
  root: string,
  input: { project?: string | null; feature: string; abandon: boolean },
): Feature {
  const feature = store.findFeature(input.feature, input.project);
  if (feature.status === "done" || feature.status === "abandoned") {
    throw new StoreError(`feature is already ${feature.status}`, "invalid");
  }
  for (const link of feature.repos) {
    if (link.worktreePath && existsSync(link.worktreePath) && !isClean(link.worktreePath)) {
      throw new StoreError(`worktree is not clean: ${link.worktreePath}`, "invalid");
    }
  }
  if (!input.abandon) {
    for (const link of feature.repos) {
      const base = prepareBase(link.path, link.baseBranch);
      if (!refExists(link.path, `refs/heads/${link.branch}`) || !isAncestor(link.path, link.branch, base)) {
        throw new StoreError(
          `${link.branch} is not merged into ${link.baseBranch} in ${link.name}; merge the PR, or push the base branch after: oanastack feature merge ${feature.slug} --project ${feature.projectSlug} --local`,
          "invalid",
        );
      }
    }
  }
  const archive = featureArchive(root, feature.projectSlug, feature.slug);
  if (feature.workspacePath && existsSync(feature.workspacePath)) archiveMetadata(feature.workspacePath, archive);
  for (const link of feature.repos) removeWorktreeAndBranch(link, input.abandon);
  if (feature.workspacePath && existsSync(feature.workspacePath)) {
    rmSync(feature.workspacePath, { recursive: true, force: true });
  }
  const closed = store.closeFeatureRecord(feature.id, input.abandon ? "abandoned" : "done", archive);
  writeFeatureFiles(archive, closed);
  return closed;
}

export function syncFeatureContext(store: Store, featureId: number): void {
  const feature = store.getFeatureById(featureId);
  const dir = feature.workspacePath;
  if (!dir || !existsSync(dir)) return;
  writeFeatureFiles(dir, feature);
}

export function repoCatalog(store: Store): Array<Repo & { defaultBranch: string; branches: string[] }> {
  return store.listRepos().map((repo) => ({
    ...repo,
    defaultBranch: safeDefaultBranch(repo.path),
    branches: safeBranches(repo.path),
  }));
}

export function browseDirectories(requested: string): BrowseResult {
  const raw = requested.trim() || homeFallback();
  const expanded = expandHome(raw);
  if (!path.isAbsolute(expanded)) throw new StoreError("browse path must be absolute", "invalid");
  let resolved: string;
  try {
    resolved = realpathSync(expanded);
  } catch {
    throw new StoreError(`path does not exist: ${expanded}`, "invalid");
  }
  let info: ReturnType<typeof statSync>;
  try {
    info = statSync(resolved);
  } catch {
    throw new StoreError(`path does not exist: ${resolved}`, "invalid");
  }
  if (!info.isDirectory()) throw new StoreError(`path is not a directory: ${resolved}`, "invalid");
  let names: string[];
  try {
    names = readdirSync(resolved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unreadable";
    throw new StoreError(`cannot list ${resolved}: ${message}`, "invalid");
  }
  const dirs: BrowseEntry[] = [];
  for (const name of names) {
    if (name === ".git") continue;
    const entryPath = path.join(resolved, name);
    let entryStat: ReturnType<typeof statSync>;
    try {
      entryStat = statSync(entryPath);
    } catch {
      continue;
    }
    if (!entryStat.isDirectory()) continue;
    dirs.push({ name, path: entryPath });
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  const truncated = dirs.length > 200;
  const parent = path.dirname(resolved);
  return {
    path: resolved,
    parent: parent === resolved ? null : parent,
    entries: truncated ? dirs.slice(0, 200) : dirs,
    truncated,
  };
}

export function parseFeatureRepos(rawArgs: string[], from: string | undefined): Array<{ name: string; base: string }> {
  const specs: Array<{ name: string; base: string }> = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i] ?? "";
    let value: string | undefined;
    if (arg === "--repo") {
      value = rawArgs[i + 1];
      if (!value || value.startsWith("-")) throw new StoreError("--repo needs a value", "invalid");
      i += 1;
    } else if (arg.startsWith("--repo=")) {
      value = arg.slice("--repo=".length);
    } else {
      continue;
    }
    const split = value.indexOf(":");
    if (split === -1) specs.push({ name: value.trim(), base: "" });
    else specs.push({ name: value.slice(0, split).trim(), base: value.slice(split + 1).trim() });
  }
  if (specs.length === 0) throw new StoreError("feature new needs at least one --repo name:base", "invalid");
  if (specs.length === 1 && specs[0] && specs[0].base === "" && from?.trim()) specs[0].base = from.trim();
  for (const spec of specs) {
    if (!spec.name || !spec.base) {
      throw new StoreError("each --repo needs a base branch (name:base, or a single --repo name --from base)", "invalid");
    }
  }
  return specs;
}

function writeFeatureFiles(dir: string, feature: Feature): void {
  mkdirSync(path.join(dir, ".oanastack"), { recursive: true });
  const tasksPath = path.join(dir, ".oanastack", "tasks.md");
  const tasks = existsSync(tasksPath) ? readFileSync(tasksPath, "utf8") : "";
  const body = renderContext(feature, tasks);
  writeFileSync(path.join(dir, ".oanastack", "feature.json"), `${JSON.stringify(featureJson(feature), null, 2)}\n`);
  writeFileSync(path.join(dir, ".oanastack", "context.md"), body);
  writeFileSync(path.join(dir, "AGENTS.md"), body);
}

function featureJson(feature: Feature) {
  return {
    project: feature.projectSlug,
    feature: feature.slug,
    status: feature.status,
    goal: feature.goal,
    workspace: feature.workspacePath,
    archive: feature.archivePath,
    repos: feature.repos.map((repo) => ({
      name: repo.name,
      path: repo.path,
      base: repo.baseBranch,
      branch: repo.branch,
      worktree: repo.worktreePath,
      prUrl: repo.prUrl,
    })),
  };
}

function renderContext(feature: Feature, tasks: string): string {
  const goal = feature.goal?.trim() || "No goal recorded.";
  const repoBlocks = feature.repos
    .map((repo) => {
      const tests = repo.testCommand ? `\n- tests: \`${repo.testCommand}\`` : "";
      const pr = repo.prUrl ? `\n- pr: ${repo.prUrl}` : "";
      const worktree = repo.worktreePath ?? "removed";
      return `### ${repo.name}\n- primary: \`${repo.path}\`\n- base: \`${repo.baseBranch}\`\n- branch: \`${repo.branch}\`\n- worktree: \`${worktree}\`${tests}${pr}`;
    })
    .join("\n\n");
  const multi = feature.repos.length > 1 ? " --repo <name>" : "";
  return `# Feature ${feature.slug}

Generated by oanastack for agents working this feature. Edit \`.oanastack/tasks.md\` for the task list. This file is rewritten when the feature, its targets, or its completion records change.

Work only in the worktrees listed below. Do not develop in the primary checkout. Do not commit \`.oanastack/\` or \`AGENTS.md\` unless asked.

## Goal

${goal}

## Status

${feature.status}

## Repos

${repoBlocks || "No repos."}

## Tasks

${tasks.trim() || "No tasks file yet."}

## Progress

${progressLines(feature)}

## Log via CLI

\`\`\`bash
oanastack target add ${feature.projectSlug} "<title>" --feature ${feature.slug}${multi} --json
oanastack target result <id> success|failed|rejected --summary "<text>" --json
oanastack done <id> --changed "<what>" --why "<why>" --verified "<tests or links>" --check "<what to review>" --json
oanastack round add ${feature.projectSlug} ${feature.slug} --repo <name> --summary "<short ask>" --outcome "<short result>" --instruction "<full ask>" --reply "<full reply>" --json
oanastack feature status ${feature.slug} --project ${feature.projectSlug} --json
\`\`\`
`;
}

function progressLines(feature: Feature): string {
  if (feature.targets.length === 0) return "No targets yet.";
  return feature.targets
    .map((target) => {
      const ids = target.completions.map((completion) => `#${completion.id}`).join(", ");
      const completions = ids ? ` — completion ${ids}` : "";
      const latest = target.completions[0];
      const review = latest?.review ? ` — check: ${oneLine(latest.review)}` : "";
      const span = target.endSha
        ? ` — ${(target.startSha ?? "base").slice(0, 7)}..${target.endSha.slice(0, 7)}`
        : target.startSha
          ? ` — start ${target.startSha.slice(0, 7)}`
          : "";
      return `- #${target.id} ${target.status} ${target.title}${span}${completions}${review}`;
    })
    .join("\n");
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function tasksTemplate(slug: string, goal: string | null): string {
  const text = goal?.trim() ?? "";
  return `# ${slug}\n\n## Goal\n\n${text}\n\n## Tasks\n\n- [ ] \n`;
}

function runTests(link: FeatureRepoLink, env: NodeJS.ProcessEnv): void {
  if (!link.testCommand || !link.worktreePath) return;
  const result = spawnSync(link.testCommand, {
    cwd: link.worktreePath,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, ...env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new StoreError(`tests failed in ${link.name}: ${result.error.message}`, "invalid");
  }
  if ((result.status ?? 1) !== 0) {
    throw new StoreError(`tests failed in ${link.name}: ${tail(result.stderr || result.stdout || "")}`, "invalid");
  }
}

function localMerge(link: FeatureRepoLink, env: NodeJS.ProcessEnv): void {
  if (!isClean(link.path)) throw new StoreError(`primary checkout is not clean: ${link.path}`, "invalid");
  if (!refExists(link.path, `refs/heads/${link.baseBranch}`)) {
    throw new StoreError(`local base branch ${link.baseBranch} is missing in ${link.name}`, "invalid");
  }
  git(link.path, ["checkout", link.baseBranch], { env });
  const merged = git(link.path, ["merge", "--no-edit", link.branch], { allowFail: true, env });
  if (merged.status !== 0) {
    git(link.path, ["merge", "--abort"], { allowFail: true, env });
    throw new StoreError(
      `merging ${link.branch} into ${link.baseBranch} failed in ${link.name}: ${tail(merged.stderr || merged.stdout)}`,
      "invalid",
    );
  }
}

function pushAndPr(link: FeatureRepoLink, feature: Feature, env: NodeJS.ProcessEnv): string {
  if (!link.worktreePath) throw new StoreError(`worktree is missing for ${link.name}`, "invalid");
  if (!hasOrigin(link.path)) {
    throw new StoreError(`repo ${link.name} has no origin; rerun with --local to merge into the base branch`, "invalid");
  }
  git(link.worktreePath, ["push", "-u", "origin", link.branch], { env });
  const gh = env.OANASTACK_GH?.trim() || "gh";
  const child = { ...process.env, ...env, GIT_TERMINAL_PROMPT: "0" };
  const view = spawnSync(gh, ["pr", "view", "--json", "url", "--jq", ".url"], {
    cwd: link.worktreePath,
    encoding: "utf8",
    env: child,
  });
  if (view.error && (view.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new StoreError("gh is not installed; rerun with --local to merge into the base branch", "invalid");
  }
  if (view.status === 0 && view.stdout.trim()) return view.stdout.trim();
  const title = feature.goal?.trim() || feature.slug;
  const body = `Feature ${feature.projectSlug}/${feature.slug}\n\nWorktree: ${link.worktreePath}`;
  const created = spawnSync(
    gh,
    ["pr", "create", "--base", link.baseBranch, "--head", link.branch, "--title", title, "--body", body],
    { cwd: link.worktreePath, encoding: "utf8", env: child },
  );
  if (created.error && (created.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new StoreError("gh is not installed; rerun with --local to merge into the base branch", "invalid");
  }
  if ((created.status ?? 1) !== 0) {
    throw new StoreError(`gh pr create failed in ${link.name}: ${tail(created.stderr || created.stdout || "")}`, "invalid");
  }
  const url = created.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!url) throw new StoreError(`gh pr create returned no URL in ${link.name}`, "invalid");
  return url;
}

function removeWorktreeAndBranch(link: FeatureRepoLink, abandon: boolean): void {
  if (link.worktreePath && existsSync(link.worktreePath)) {
    const removed = git(link.path, ["worktree", "remove", "--force", link.worktreePath], { allowFail: true });
    if (removed.status !== 0) {
      throw new StoreError(`removing worktree failed in ${link.name}: ${tail(removed.stderr || removed.stdout)}`, "invalid");
    }
  } else {
    git(link.path, ["worktree", "prune"], { allowFail: true });
  }
  if (!refExists(link.path, `refs/heads/${link.branch}`)) return;
  if (abandon) {
    git(link.path, ["branch", "-D", link.branch]);
    return;
  }
  const soft = git(link.path, ["branch", "-d", link.branch], { allowFail: true });
  if (soft.status === 0) return;
  git(link.path, ["branch", "-D", link.branch]);
}

function archiveMetadata(workspace: string, archive: string): void {
  mkdirSync(archive, { recursive: true });
  const meta = path.join(workspace, ".oanastack");
  if (existsSync(meta)) cpSync(meta, path.join(archive, ".oanastack"), { recursive: true });
  const agents = path.join(workspace, "AGENTS.md");
  if (existsSync(agents)) cpSync(agents, path.join(archive, "AGENTS.md"));
}

function rollback(made: Array<{ repo: string; worktree: string; branch: string }>, workspace: string): void {
  for (const item of made) {
    git(item.repo, ["worktree", "remove", "--force", item.worktree], { allowFail: true });
    git(item.repo, ["worktree", "prune"], { allowFail: true });
    git(item.repo, ["branch", "-D", item.branch], { allowFail: true });
  }
  rmSync(workspace, { recursive: true, force: true });
}

function safeDefaultBranch(repo: string): string {
  try {
    return defaultBranch(repo);
  } catch {
    return "main";
  }
}

function safeBranches(repo: string): string[] {
  try {
    return listBranches(repo);
  } catch {
    return [];
  }
}

function homeFallback(): string {
  return expandHome("~");
}
