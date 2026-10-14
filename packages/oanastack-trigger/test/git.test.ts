import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { locateCheckout } from "../src/git.js";
import { TriggerStore } from "../src/store.js";
import { tempHome } from "./helpers.js";

function gitRepo(parent: string, branch: string): string {
  const dir = path.join(parent, "repo");
  mkdirSync(dir);
  execFileSync("git", ["init", "-b", branch], { cwd: dir });
  execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "--allow-empty", "-m", "init"], {
    cwd: dir,
  });
  return dir;
}

describe("git checkout", () => {
  it("reads the branch and worktree root with git rev-parse", () => {
    const { home } = tempHome();
    const repo = gitRepo(home, "feature/session-branch");
    const nested = path.join(repo, "src");
    mkdirSync(nested);
    expect(locateCheckout({ cwd: nested, worktree: null })).toEqual({
      branch: "feature/session-branch",
      cwd: nested,
      worktree: repo,
    });
  });

  it("keeps the hinted paths when the directory is not a git checkout", () => {
    const { home } = tempHome();
    const dir = path.join(home, "plain");
    mkdirSync(dir);
    expect(locateCheckout({ cwd: dir, worktree: dir })).toEqual({
      branch: null,
      cwd: dir,
      worktree: dir,
    });
  });

  it("adds branch onto a database created before the column existed", () => {
    const { location } = tempHome();
    mkdirSync(path.dirname(location.dbPath), { recursive: true });
    const db = new DatabaseSync(location.dbPath);
    db.exec(`CREATE TABLE agents (
      agent TEXT PRIMARY KEY,
      kind TEXT,
      generation INTEGER NOT NULL DEFAULT 0,
      last_status TEXT,
      last_forwarded_status TEXT,
      last_forwarded_hash TEXT,
      cwd TEXT,
      worktree TEXT,
      updated_at TEXT NOT NULL
    )`);
    db.exec(`CREATE TABLE events (
      id INTEGER PRIMARY KEY,
      dedupe_key TEXT NOT NULL UNIQUE,
      agent TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      text TEXT,
      cwd TEXT,
      worktree TEXT,
      ts TEXT NOT NULL,
      state TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      next_attempt_at TEXT,
      created_at TEXT NOT NULL,
      delivered_at TEXT
    )`);
    db.close();
    const store = new TriggerStore(location.dbPath);
    try {
      store.recordSession({
        agent: "cx1",
        kind: "codex",
        branch: "main",
        cwd: "/work",
        worktree: "/work",
      });
      expect(store.listAgents()).toMatchObject([
        { agent: "cx1", kind: "codex", branch: "main", cwd: "/work", worktree: "/work" },
      ]);
    } finally {
      store.close();
    }
  });
});
