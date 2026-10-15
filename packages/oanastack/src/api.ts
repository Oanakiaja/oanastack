import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { StoreError } from "./errors.js";
import { headSha } from "./git.js";
import { diffWorktree, measureWorktree, type WorktreeDiff } from "./git-stats.js";
import type { Store } from "./store.js";
import { onWorktree, taskRanges, type TaskRange } from "./task-range.js";
import type { Feature, FeatureRepoLink, ResultStatus, Target } from "./types.js";
import { browseDirectories, closeFeature, createFeature, mergeFeature, registerRepo, repoCatalog, syncFeatureContext } from "./workspace.js";

export function resolveWebRoot(moduleUrl: string = import.meta.url): string | null {
  const dir = path.dirname(fileURLToPath(moduleUrl));
  const candidates = [path.join(dir, "web"), path.join(dir, "../dist/web")];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "index.html"))) return candidate;
  }
  return null;
}

export function createApp(store: Store, options?: { webRoot?: string | null; env?: NodeJS.ProcessEnv }): Hono {
  const app = new Hono();
  const webRoot = options?.webRoot ?? null;
  const env = options?.env ?? process.env;

  app.onError((err, c) => {
    if (err instanceof StoreError) {
      const status = err.code === "not_found" ? 404 : err.code === "conflict" ? 409 : 400;
      return c.json({ error: err.message }, status);
    }
    const message = err instanceof Error ? err.message : "internal error";
    return c.json({ error: message }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/overview", (c) => c.json(store.overview()));
  app.get("/api/browse", (c) => c.json(browseDirectories(c.req.query("path") ?? "")));
  app.get("/api/repos", (c) => c.json(repoCatalog(store)));
  app.post("/api/repos", async (c) => {
    const body = await readJson(c);
    const repo = registerRepo(store, {
      name: requireString(body, "name"),
      path: requireString(body, "path"),
      testCommand: optionalString(body, "testCommand") ?? optionalString(body, "test"),
    });
    return c.json(repo, 201);
  });
  app.get("/api/projects", (c) => c.json(store.listProjects()));
  app.post("/api/projects", async (c) => {
    const body = await readJson(c);
    const project = store.addProject({
      slug: requireString(body, "slug"),
      name: optionalString(body, "name"),
      note: optionalString(body, "note"),
    });
    return c.json(project, 201);
  });
  app.get("/api/projects/:slug", (c) => c.json(store.getProject(c.req.param("slug"))));
  app.get("/api/projects/:slug/worktrees", (c) => {
    const project = store.getProject(c.req.param("slug"));
    const worktrees = project.features.flatMap((feature) =>
      feature.repos.map((repo) => ({
        featureId: feature.id,
        featureSlug: feature.slug,
        featureStatus: feature.status,
        goal: feature.goal,
        repoName: repo.name,
        repoPath: repo.path,
        baseBranch: repo.baseBranch,
        branch: repo.branch,
        worktreePath: repo.worktreePath,
        prUrl: repo.prUrl,
        ...measureWorktree({
          repoPath: repo.path,
          worktreePath: repo.worktreePath,
          baseBranch: repo.baseBranch,
          branch: repo.branch,
        }),
      })),
    );
    return c.json({ project: project.slug, worktrees });
  });
  app.get("/api/projects/:slug/diff", (c) => {
    const featureSlug = c.req.query("feature");
    const repoName = c.req.query("repo");
    if (!featureSlug || !repoName) throw new StoreError("feature and repo are required", "invalid");
    const feature = store.getFeature(c.req.param("slug"), featureSlug);
    const repo = feature.repos.find((item) => item.name === repoName);
    if (!repo) throw new StoreError(`repo not on feature: ${repoName}`, "not_found");
    const file = c.req.query("file");
    const dir = c.req.query("dir");
    if (dir && (dir.startsWith("/") || dir.split("/").includes(".."))) {
      throw new StoreError("dir must be a relative path inside the diff", "invalid");
    }
    const scope = {
      all: c.req.query("all") === "1",
      dir: dir || undefined,
      full: c.req.query("full") === "1" && Boolean(file) && c.req.query("all") !== "1",
    };
    const targetId = targetQuery(c.req.query("target"));
    if (targetId === null) {
      return c.json(
        diffWorktree(
          {
            repoPath: repo.path,
            worktreePath: repo.worktreePath,
            baseBranch: repo.baseBranch,
            branch: repo.branch,
          },
          file || undefined,
          scope,
        ),
      );
    }
    return c.json(diffForTarget(feature, repo, targetId, file || undefined, scope));
  });
  app.get("/api/projects/:slug/features/:feature/repos/:repo/rounds", (c) => {
    const feature = store.getFeature(c.req.param("slug"), c.req.param("feature"));
    const repo = feature.repos.find((item) => item.name === c.req.param("repo"));
    if (!repo) throw new StoreError(`repo not on feature: ${c.req.param("repo")}`, "not_found");
    return c.json(repo.rounds);
  });
  app.post("/api/projects/:slug/features/:feature/repos/:repo/rounds", async (c) => {
    const body = await readJson(c);
    const round = store.addRound({
      project: c.req.param("slug"),
      feature: c.req.param("feature"),
      repo: c.req.param("repo"),
      instruction: requireString(body, "instruction"),
      reply: requireString(body, "reply"),
      summary: optionalString(body, "summary"),
      outcome: optionalString(body, "outcome"),
      tools: optionalString(body, "tools"),
    });
    syncFeatureContext(store, store.getFeature(c.req.param("slug"), c.req.param("feature")).id);
    return c.json(round, 201);
  });
  app.post("/api/projects/:slug/features", async (c) => {
    const body = await readJson(c);
    const feature = createFeature(store, store.root, {
      project: c.req.param("slug"),
      slug: requireString(body, "slug"),
      goal: optionalString(body, "goal"),
      repos: requireRepoSpecs(body),
    });
    return c.json(feature, 201);
  });
  app.post("/api/projects/:slug/features/:feature/merge", async (c) => {
    const body = await readJson(c);
    const feature = mergeFeature(store, {
      project: c.req.param("slug"),
      feature: c.req.param("feature"),
      local: optionalBoolean(body, "local"),
      env,
    });
    return c.json(feature);
  });
  app.post("/api/projects/:slug/features/:feature/close", async (c) => {
    const body = await readJson(c);
    const feature = closeFeature(store, store.root, {
      project: c.req.param("slug"),
      feature: c.req.param("feature"),
      abandon: optionalBoolean(body, "abandon"),
    });
    return c.json(feature);
  });
  app.post("/api/projects/:slug/targets", async (c) => {
    const body = await readJson(c);
    const created = store.addTarget({
      project: c.req.param("slug"),
      title: requireString(body, "title"),
      worktreePath: optionalString(body, "worktreePath"),
      branch: optionalString(body, "branch"),
      feature: optionalString(body, "feature"),
      repo: optionalString(body, "repo"),
      startSha: optionalString(body, "startSha"),
    });
    const target = created.startSha ? created : rememberSha(store, created, "start");
    if (target.featureId !== null) syncFeatureContext(store, target.featureId);
    return c.json(target, 201);
  });
  app.get("/api/targets/:id", (c) => c.json(store.getTarget(idParam(c.req.param("id")))));
  app.post("/api/targets/:id/result", async (c) => {
    const body = await readJson(c);
    const id = idParam(c.req.param("id"));
    const current = store.getTarget(id);
    const explicitEnd = optionalString(body, "endSha");
    const target = store.setResult(id, {
      status: requireString(body, "status") as ResultStatus,
      summary: optionalString(body, "summary"),
      worktreePath: optionalString(body, "worktreePath"),
      branch: optionalString(body, "branch"),
      herdrStatus: optionalString(body, "herdrStatus"),
      herdrResult: optionalString(body, "herdrResult"),
      endSha: explicitEnd ?? headSha(optionalString(body, "worktreePath") ?? current.worktreePath) ?? undefined,
    });
    if (target.featureId !== null) syncFeatureContext(store, target.featureId);
    return c.json(target);
  });
  app.post("/api/targets/:id/completions", async (c) => {
    const body = await readJson(c);
    const id = idParam(c.req.param("id"));
    rememberSha(store, store.getTarget(id), "end");
    const completion = store.addCompletion(id, {
      changed: requireString(body, "changed"),
      why: requireString(body, "why"),
      verified: requireString(body, "verified"),
      risks: optionalString(body, "risks"),
      review: optionalString(body, "review") ?? optionalString(body, "check"),
    });
    const target = store.getTarget(completion.targetId);
    if (target.featureId !== null) syncFeatureContext(store, target.featureId);
    return c.json(completion, 201);
  });
  app.post("/api/targets/:id/feature", async (c) => {
    const body = await readJson(c);
    const target = store.linkTarget(idParam(c.req.param("id")), {
      feature: requireString(body, "feature"),
      project: optionalString(body, "project"),
      repo: optionalString(body, "repo"),
    });
    if (target.featureId !== null) syncFeatureContext(store, target.featureId);
    return c.json(target);
  });

  if (webRoot) {
    app.use("/*", serveStatic({ root: webRoot }));
  }

  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) return c.json({ error: "not found" }, 404);
    if (!webRoot) {
      return c.text("dashboard assets are missing. From packages/oanastack run: npm run build\n", 503);
    }
    return c.text("not found\n", 404);
  });

  return app;
}

function targetQuery(raw: string | undefined): number | null {
  if (!raw) return null;
  if (!/^[1-9]\d*$/.test(raw)) throw new StoreError("target must be a positive integer", "invalid");
  return Number(raw);
}

function rememberSha(store: Store, target: Target, field: "start" | "end"): Target {
  const sha = headSha(target.worktreePath);
  if (!sha) return target;
  return field === "start" ? store.setTargetShas(target.id, { startSha: sha }) : store.setTargetShas(target.id, { endSha: sha });
}

function diffForTarget(
  feature: Feature,
  repo: FeatureRepoLink,
  targetId: number,
  file: string | undefined,
  scope: { all?: boolean; dir?: string; full?: boolean },
): WorktreeDiff & { range: TaskRange } {
  const linked = onWorktree(feature.targets, repo, feature.repos.length);
  const ranges = taskRanges(linked, repo.baseBranch);
  const range = ranges.find((item) => item.id === targetId);
  if (!range) throw new StoreError(`target not on this worktree: ${targetId}`, "not_found");
  if (!range.ready || !range.fromRef || !range.toRef) {
    return { ...emptyDiff(range.fromRef ?? repo.baseBranch, range.toRef ?? ""), range };
  }
  const diff = diffWorktree(
    {
      repoPath: repo.path,
      worktreePath: repo.worktreePath,
      baseBranch: repo.baseBranch,
      branch: repo.branch,
    },
    file,
    { ...scope, span: { fromRef: range.fromRef, toRef: range.toRef, live: range.live } },
  );
  return { ...diff, range };
}

function emptyDiff(base: string, head: string): WorktreeDiff {
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
    error: null,
  };
}

async function readJson(c: { req: { text: () => Promise<string> } }): Promise<Record<string, unknown>> {
  const raw = await c.req.text();
  if (!raw.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new StoreError("invalid JSON body", "invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StoreError("JSON body must be an object", "invalid");
  }
  return value as Record<string, unknown>;
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") throw new StoreError(`${key} must be a string`, "invalid");
  return value;
}

function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  if (!(key in body) || body[key] === undefined || body[key] === null) return undefined;
  const value = body[key];
  if (typeof value !== "string") throw new StoreError(`${key} must be a string`, "invalid");
  return value;
}

function idParam(raw: string): number {
  if (!/^[1-9]\d*$/.test(raw)) throw new StoreError("id must be a positive integer", "invalid");
  return Number(raw);
}

function optionalBoolean(body: Record<string, unknown>, key: string): boolean {
  if (!(key in body) || body[key] === undefined || body[key] === null) return false;
  if (typeof body[key] !== "boolean") throw new StoreError(`${key} must be a boolean`, "invalid");
  return body[key] === true;
}

function requireRepoSpecs(body: Record<string, unknown>): Array<{ name: string; base: string }> {
  const repos = body.repos;
  if (!Array.isArray(repos) || repos.length === 0) {
    throw new StoreError("repos must be a non-empty array", "invalid");
  }
  return repos.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new StoreError(`repos[${index}] must be an object`, "invalid");
    }
    const record = item as Record<string, unknown>;
    const name = record.name;
    const base = record.base ?? record.baseBranch;
    if (typeof name !== "string" || typeof base !== "string") {
      throw new StoreError(`repos[${index}] needs name and base`, "invalid");
    }
    return { name, base };
  });
}
