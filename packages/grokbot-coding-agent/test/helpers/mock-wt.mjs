#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const statePath = process.env.WT_MOCK_STATE;
if (!statePath) {
  process.stderr.write("WT_MOCK_STATE is required\n");
  process.exit(2);
}

function load() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return { worktrees: [], calls: [] };
  }
}

function save(state) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function positionalName() {
  const skip = new Set(["--create", "--no-cd", "--force", "switch", "list", "remove", "json"]);
  const values = new Set(["-C", "--format", "-b", "--base"]);
  const names = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (values.has(token)) {
      i += 1;
      continue;
    }
    if (token.startsWith("-") || skip.has(token)) {
      continue;
    }
    names.push(token);
  }
  return names[0];
}

const state = load();
state.calls = [...(state.calls ?? []), args];

if (args.includes("list")) {
  save(state);
  process.stdout.write(`${JSON.stringify(state.worktrees ?? [])}\n`);
  process.exit(0);
}

if (args.includes("switch")) {
  const name = positionalName();
  if (!name) {
    process.stderr.write("mock wt switch requires a name\n");
    process.exit(1);
  }
  const existing = (state.worktrees ?? []).find((entry) => entry.branch === name);
  if (existing) {
    save(state);
    process.stdout.write(`${JSON.stringify({ branch: existing.branch, path: existing.path })}\n`);
    process.exit(0);
  }
  const cIdx = args.indexOf("-C");
  const repo = cIdx >= 0 ? args[cIdx + 1] : process.cwd();
  const dest = path.join(repo, `${name}-wt`);
  mkdirSync(dest, { recursive: true });
  const created = { branch: name, path: dest };
  state.worktrees = [...(state.worktrees ?? []), created];
  save(state);
  process.stdout.write(`${JSON.stringify({ branch: name, path: dest })}\n`);
  process.exit(0);
}

if (args.includes("remove")) {
  const name = positionalName();
  const existing = (state.worktrees ?? []).find((entry) => entry.branch === name);
  state.worktrees = (state.worktrees ?? []).filter((entry) => entry.branch !== name);
  save(state);
  process.stdout.write(`${JSON.stringify({ branch: name, path: existing?.path })}\n`);
  process.exit(0);
}

process.stderr.write(`mock wt: unknown args ${args.join(" ")}\n`);
process.exit(1);
