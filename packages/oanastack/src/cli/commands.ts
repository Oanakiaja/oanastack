import { defineCommand } from "citty";
import { StoreError } from "../errors.js";
import { openStore } from "../store.js";
import { startServer } from "../server.js";
import { resolveWebRoot } from "../api.js";
import type { CompletionInput, Project, Target } from "../types.js";
import { CLI_BIN_NAME, DEFAULT_PORT, PACKAGE_VERSION } from "../version.js";
import { formatProjectBlock, formatProjectLine, formatTargetLine } from "./format.js";
import { emit, getIo } from "./io.js";

const json = {
  type: "boolean",
  description: "Print one JSON object",
} as const;

function using<T>(fn: (store: ReturnType<typeof openStore>) => T): T {
  const store = openStore(getIo().dbPath);
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

function requireId(raw: string): number {
  if (!/^[1-9]\d*$/.test(raw)) throw new StoreError("id must be a positive integer", "invalid");
  return Number(raw);
}

function projectBrief(project: Project) {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    note: project.note,
    progress: project.progress,
  };
}

function targetBrief(target: Target) {
  return {
    id: target.id,
    project: target.projectSlug,
    title: target.title,
    status: target.status,
    summary: target.summary,
    worktreePath: target.worktreePath,
    branch: target.branch,
    herdrStatus: target.herdrStatus,
    herdrResult: target.herdrResult,
    completions: target.completions.map((completion) => completion.id),
  };
}

const projectAdd = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} project add`,
    description: "Create a project",
  },
  args: {
    slug: { type: "positional", description: "kebab-case slug", required: true },
    name: { type: "string", description: "Display name (defaults to slug)" },
    note: { type: "string", description: "Short note" },
    json,
  },
  run({ args }) {
    const project = using((store) => store.addProject({ slug: args.slug, name: args.name, note: args.note }));
    emit(args.json === true, projectBrief(project), `project ${project.id} ${project.slug}`);
  },
});

const projectLs = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} project ls`,
    alias: "list",
    description: "List projects",
  },
  args: { json },
  run({ args }) {
    const projects = using((store) => store.listProjects());
    const line = projects.length === 0 ? "no projects" : projects.map(formatProjectLine).join("\n");
    emit(args.json === true, projects.map(projectBrief), line);
  },
});

const projectGet = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} project get`,
    description: "Show one project",
  },
  args: {
    slug: { type: "positional", description: "Project slug", required: true },
    json,
  },
  run({ args }) {
    const project = using((store) => store.getProject(args.slug));
    emit(args.json === true, project, formatProjectBlock(project));
  },
});

const project = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} project`,
    alias: "p",
    description: "Projects",
  },
  subCommands: {
    add: projectAdd,
    ls: projectLs,
    get: projectGet,
  },
});

const targetAdd = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} target add`,
    description: "Add a goal inside a project",
  },
  args: {
    project: { type: "positional", description: "Project slug", required: true },
    title: { type: "positional", description: "Goal title", required: true },
    wt: { type: "string", description: "Worktree path" },
    branch: { type: "string", description: "Branch" },
    json,
  },
  run({ args }) {
    const target = using((store) =>
      store.addTarget({
        project: args.project,
        title: args.title,
        worktreePath: args.wt,
        branch: args.branch,
      }),
    );
    emit(args.json === true, targetBrief(target), `target ${target.id} ${target.projectSlug} open ${target.title}`);
  },
});

const targetLs = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} target ls`,
    alias: "list",
    description: "List targets",
  },
  args: {
    project: { type: "positional", description: "Project slug", required: false },
    json,
  },
  run({ args }) {
    const targets = using((store) => store.listTargets(args.project));
    const line = targets.length === 0 ? "no targets" : targets.map(formatTargetLine).join("\n");
    emit(args.json === true, targets.map(targetBrief), line);
  },
});

const targetGet = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} target get`,
    description: "Show one target and its completion records",
  },
  args: {
    id: { type: "positional", description: "Target id", required: true },
    json,
  },
  run({ args }) {
    const target = using((store) => store.getTarget(requireId(args.id)));
    emit(args.json === true, target, formatTargetLine(target));
  },
});

const targetResult = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} target result`,
    description: "Record success, failed, or rejected",
  },
  args: {
    id: { type: "positional", description: "Target id", required: true },
    status: { type: "positional", description: "success, failed, or rejected", required: true },
    summary: { type: "string", description: "Result summary" },
    wt: { type: "string", description: "Worktree path" },
    branch: { type: "string", description: "Branch" },
    "herdr-status": { type: "string", description: "herdr status text" },
    herdr: { type: "string", description: "herdr result text" },
    json,
  },
  run({ args }) {
    const target = using((store) =>
      store.setResult(requireId(args.id), {
        status: args.status as "success" | "failed" | "rejected",
        summary: args.summary,
        worktreePath: args.wt,
        branch: args.branch,
        herdrStatus: args["herdr-status"],
        herdrResult: args.herdr,
      }),
    );
    emit(args.json === true, targetBrief(target), `target ${target.id} ${target.status}`);
  },
});

const target = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} target`,
    alias: "t",
    description: "Targets (one goal per record)",
  },
  subCommands: {
    add: targetAdd,
    ls: targetLs,
    get: targetGet,
    result: targetResult,
  },
});

const done = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} done`,
    description: "Log a completion record for the user to review",
  },
  args: {
    id: { type: "positional", description: "Target id", required: true },
    changed: { type: "string", description: "What changed" },
    why: { type: "string", description: "Why it changed" },
    verified: { type: "string", description: "Tests, screenshots, or links" },
    risks: { type: "string", description: "Risks or unfinished parts" },
    check: { type: "string", description: "What the user should check or expect" },
    data: { type: "string", description: "JSON object with the same fields" },
    json,
  },
  run({ args }) {
    const input = completionFromArgs(args);
    const completion = using((store) => store.addCompletion(requireId(args.id), input));
    emit(args.json === true, completion, `completion ${completion.id} target ${completion.targetId}`);
  },
});

const show = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} show`,
    description: "Print projects, targets, and progress",
  },
  args: { json },
  run({ args }) {
    const overview = using((store) => store.overview());
    const line =
      overview.projects.length === 0 ? "no projects" : overview.projects.map(formatProjectBlock).join("\n");
    emit(args.json === true, overview, line);
  },
});

const serve = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} serve`,
    description: "Serve the local dashboard and JSON API",
  },
  args: {
    port: { type: "string", description: "Listen port", default: String(DEFAULT_PORT) },
    host: { type: "string", description: "Loopback host", default: "127.0.0.1" },
    json,
  },
  async run({ args }) {
    const store = openStore(getIo().dbPath);
    try {
      const port = Number(args.port);
      const running = await startServer({
        store,
        port,
        hostname: args.host,
        webRoot: resolveWebRoot(),
      });
      emit(args.json === true, { url: running.url, db: store.path }, `${running.url}\ndb ${store.path}`);
      await waitForStop();
      await running.close();
    } finally {
      store.close();
    }
  },
});

export const main = defineCommand({
  meta: {
    name: CLI_BIN_NAME,
    version: PACKAGE_VERSION,
    description: "Local progress dashboard for agent-driven work",
  },
  subCommands: {
    serve,
    show,
    project,
    target,
    done,
  },
});

function completionFromArgs(args: {
  data?: string;
  changed?: string;
  why?: string;
  verified?: string;
  risks?: string;
  check?: string;
}): CompletionInput {
  let data: Record<string, unknown> = {};
  if (args.data !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(args.data) as unknown;
    } catch {
      throw new StoreError("--data must be JSON", "invalid");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new StoreError("--data must be a JSON object", "invalid");
    }
    data = parsed as Record<string, unknown>;
  }
  const pick = (flag: string | undefined, ...keys: string[]): string | undefined => {
    if (flag !== undefined) return flag;
    for (const key of keys) {
      if (!(key in data)) continue;
      const value = data[key];
      if (value === null) return undefined;
      if (typeof value !== "string") throw new StoreError(`${key} must be a string`, "invalid");
      return value;
    }
    return undefined;
  };
  const changed = pick(args.changed, "changed");
  const why = pick(args.why, "why");
  const verified = pick(args.verified, "verified");
  if (changed === undefined || why === undefined || verified === undefined) {
    throw new StoreError("done needs --changed, --why, and --verified", "invalid");
  }
  return {
    changed,
    why,
    verified,
    risks: pick(args.risks, "risks"),
    review: pick(args.check, "check", "review"),
  };
}

function waitForStop(): Promise<void> {
  return new Promise((resolve) => {
    const stop = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
