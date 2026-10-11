import { defineCommand } from "citty";
import { writeConfiguredRoot } from "../paths.js";
import { openStore, type Store } from "../store.js";
import type { Feature, Repo } from "../types.js";
import { CLI_BIN_NAME } from "../version.js";
import {
  closeFeature,
  createFeature,
  mergeFeature,
  parseFeatureRepos,
  registerRepo,
} from "../workspace.js";
import { formatFeatureLine, formatRepoLine } from "./format.js";
import { emit, getIo } from "./io.js";

const json = {
  type: "boolean",
  description: "Print one JSON object",
} as const;

function using<T>(fn: (store: Store) => T): T {
  const io = getIo();
  const store = openStore(io.dbPath, io.root);
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

function featureText(feature: Feature): string {
  const lines = [formatFeatureLine(feature)];
  if (feature.goal) lines.push(feature.goal);
  return lines.join("\n");
}

function repoBrief(repo: Repo) {
  return { id: repo.id, name: repo.name, path: repo.path, testCommand: repo.testCommand };
}

const configRoot = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} config root`,
    description: "Show or set the oanastack root",
  },
  args: {
    path: { type: "positional", description: "Absolute directory", required: false },
    json,
  },
  run({ args }) {
    const io = getIo();
    if (!args.path) {
      emit(args.json === true, { root: io.root, db: io.dbPath }, `root ${io.root}\ndb ${io.dbPath}`);
      return;
    }
    const saved = writeConfiguredRoot(io.env, args.path);
    const override = io.env.OANASTACK_HOME?.trim() || io.env.OANASTACK_DB?.trim();
    const note = override
      ? `\nThis process still uses ${io.root} because OANASTACK_HOME or OANASTACK_DB is set.`
      : "";
    emit(
      args.json === true,
      { root: saved.root, db: saved.dbPath, config: saved.configPath },
      `root ${saved.root}\ndb ${saved.dbPath}\nconfig ${saved.configPath}${note}`,
    );
  },
});

export const configCommand = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} config`,
    description: "Root directory and database location",
  },
  subCommands: { root: configRoot },
});

const repoAdd = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} repo add`,
    description: "Register a git repo by its absolute path",
  },
  args: {
    name: { type: "positional", description: "kebab-case name", required: true },
    path: { type: "string", description: "Absolute path to the repo root", required: true },
    test: { type: "string", description: "Test command run in the worktree before merge" },
    json,
  },
  run({ args }) {
    const repo = using((store) => registerRepo(store, { name: args.name, path: args.path, testCommand: args.test }));
    emit(args.json === true, repoBrief(repo), formatRepoLine(repo));
  },
});

const repoLs = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} repo ls`,
    alias: "list",
    description: "List registered repos",
  },
  args: { json },
  run({ args }) {
    const repos = using((store) => store.listRepos());
    const line = repos.length === 0 ? "no repos" : repos.map(formatRepoLine).join("\n");
    emit(args.json === true, repos.map(repoBrief), line);
  },
});

export const repoCommand = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} repo`,
    description: "Repos registered by absolute path",
  },
  subCommands: { add: repoAdd, ls: repoLs },
});

const featureNew = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} feature new`,
    description: "Create a feature workspace with one worktree per repo",
  },
  args: {
    project: { type: "positional", description: "Project slug", required: true },
    feature: { type: "positional", description: "Feature slug", required: true },
    repo: { type: "string", description: "Repo spec name:base (repeatable)" },
    from: { type: "string", description: "Base branch when a single --repo has no :base" },
    goal: { type: "string", description: "Feature goal" },
    json,
  },
  run({ args, rawArgs }) {
    const repos = parseFeatureRepos(rawArgs, args.from);
    const feature = using((store) =>
      createFeature(store, getIo().root, {
        project: args.project,
        slug: args.feature,
        goal: args.goal,
        repos,
      }),
    );
    emit(args.json === true, feature, featureText(feature));
  },
});

const featureLs = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} feature ls`,
    alias: "list",
    description: "List features",
  },
  args: {
    project: { type: "positional", description: "Project slug", required: false },
    json,
  },
  run({ args }) {
    const features = using((store) => store.listFeatures(args.project));
    const line = features.length === 0 ? "no features" : features.map(formatFeatureLine).join("\n");
    emit(args.json === true, features, line);
  },
});

const featureStatus = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} feature status`,
    description: "Show one feature",
  },
  args: {
    feature: { type: "positional", description: "Feature slug", required: true },
    project: { type: "string", description: "Project slug when the feature name is shared" },
    json,
  },
  run({ args }) {
    const feature = using((store) => store.findFeature(args.feature, args.project));
    emit(args.json === true, feature, featureText(feature));
  },
});

const featureMerge = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} feature merge`,
    description: "Update each worktree from its base, test, then open a PR or merge locally",
  },
  args: {
    feature: { type: "positional", description: "Feature slug", required: true },
    project: { type: "string", description: "Project slug when the feature name is shared" },
    local: { type: "boolean", description: "Merge into the local base branch instead of opening a PR" },
    json,
  },
  run({ args }) {
    const feature = using((store) =>
      mergeFeature(store, {
        feature: args.feature,
        project: args.project,
        local: args.local === true,
        env: getIo().env,
      }),
    );
    emit(args.json === true, feature, featureText(feature));
  },
});

const featureClose = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} feature close`,
    description: "Archive metadata and remove worktrees after every repo is merged and clean",
  },
  args: {
    feature: { type: "positional", description: "Feature slug", required: true },
    project: { type: "string", description: "Project slug when the feature name is shared" },
    abandon: { type: "boolean", description: "Close an unmerged feature and delete its branches" },
    json,
  },
  run({ args }) {
    const feature = using((store) =>
      closeFeature(store, getIo().root, {
        feature: args.feature,
        project: args.project,
        abandon: args.abandon === true,
      }),
    );
    emit(args.json === true, feature, featureText(feature));
  },
});

export const featureCommand = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} feature`,
    description: "Multi-repo feature workspaces",
  },
  subCommands: {
    new: featureNew,
    ls: featureLs,
    status: featureStatus,
    merge: featureMerge,
    close: featureClose,
  },
});
