import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { StoreError } from "../src/errors.js";
import { openStore, progressOf } from "../src/store.js";

function tempDb(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "oanastack-")), "oanastack.sqlite");
}

describe("store", () => {
  it("records projects, targets, results, and completions", () => {
    const dbPath = tempDb();
    const store = openStore(dbPath);
    const project = store.addProject({ slug: "billing-api", name: "Billing API", note: "charges" });
    expect(project.progress).toEqual(progressOf([]));

    const target = store.addTarget({
      project: "billing-api",
      title: "Idempotent charge keys",
      worktreePath: "/tmp/billing",
      branch: "feature/idempotency",
    });
    expect(target.status).toBe("open");

    const updated = store.setResult(target.id, {
      status: "success",
      summary: "retries no longer double-charge",
      herdrStatus: "ok",
      herdrResult: "herdr apply finished",
    });
    expect(updated.status).toBe("success");
    expect(updated.worktreePath).toBe("/tmp/billing");
    expect(updated.herdrResult).toBe("herdr apply finished");

    const completion = store.addCompletion(target.id, {
      changed: "charge keys are stored before capture",
      why: "retries were creating a second charge",
      verified: "npm test\nhttps://example.test/run/1",
      risks: "legacy clients still omit the key",
      review: "place the same order twice and expect one charge",
    });
    expect(completion.targetId).toBe(target.id);

    const overview = store.overview();
    expect(overview.dbPath).toBe(dbPath);
    expect(overview.progress).toMatchObject({ total: 1, success: 1, ratio: 1 });
    expect(overview.projects[0]?.targets[0]?.completions[0]?.review).toContain("one charge");
    store.close();

    const again = openStore(dbPath);
    expect(again.listProjects()).toHaveLength(1);
    again.close();
  });

  it("counts mixed statuses and rejects bad input", () => {
    const store = openStore(tempDb());
    store.addProject({ slug: "auth-session" });
    const ok = store.addTarget({ project: "auth-session", title: "Rotate refresh tokens" });
    const bad = store.addTarget({ project: "auth-session", title: "Webhook signature" });
    const skip = store.addTarget({ project: "auth-session", title: "Drop legacy cookie" });
    store.addTarget({ project: "auth-session", title: "Retry budget" });
    store.setResult(ok.id, { status: "success", summary: "rotated" });
    store.setResult(bad.id, { status: "failed", summary: "sig mismatch" });
    store.setResult(skip.id, { status: "rejected", summary: "out of scope" });

    expect(store.overview().progress).toEqual({
      total: 4,
      open: 1,
      success: 1,
      failed: 1,
      rejected: 1,
      ratio: 0.25,
    });

    expect(() => store.addProject({ slug: "Auth Session" })).toThrow(StoreError);
    expect(() => store.addProject({ slug: "auth-session" })).toThrow(/already exists/);
    expect(() => store.setResult(ok.id, { status: "open" as "success" })).toThrow(/status must be/);
    expect(() => store.addCompletion(ok.id, { changed: " ", why: "y", verified: "v" })).toThrow(/changed is required/);
    expect(() => store.getProject("missing")).toThrow(/not found/);
    store.close();
  });

  it("upgrades a v1 database and keeps existing targets", () => {
    const dbPath = tempDb();
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE targets (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        summary TEXT,
        worktree_path TEXT,
        branch TEXT,
        herdr_status TEXT,
        herdr_result TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE completions (
        id INTEGER PRIMARY KEY,
        target_id INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
        changed TEXT NOT NULL,
        why TEXT NOT NULL,
        verified TEXT NOT NULL,
        risks TEXT,
        review TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO projects (slug, name, created_at, updated_at) VALUES ('billing-api', 'Billing API', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      INSERT INTO targets (project_id, title, created_at, updated_at) VALUES (1, 'Idempotent charge keys', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      PRAGMA user_version = 1;
    `);
    db.close();

    const store = openStore(dbPath);
    expect(store.getProject("billing-api").targets[0]).toMatchObject({ title: "Idempotent charge keys", featureId: null });
    const repo = store.addRepo({ name: "billing", path: "/tmp/billing-repo" });
    expect(repo.path).toBe("/tmp/billing-repo");
    expect(store.overview().repos).toHaveLength(1);
    store.close();

    const again = new DatabaseSync(dbPath);
    const version = again.prepare("PRAGMA user_version").get() as { user_version: number };
    expect(version.user_version).toBe(4);
    const columns = again.prepare("PRAGMA table_info(targets)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining(["start_sha", "end_sha"]));
    again.close();
  });

  it("upgrades a v2 database with a rounds table", () => {
    const dbPath = tempDb();
    const primed = openStore(dbPath);
    primed.addProject({ slug: "billing-api" });
    primed.addRepo({ name: "billing", path: "/tmp/billing-repo" });
    primed.addFeature({
      project: "billing-api",
      slug: "charge-keys",
      workspacePath: "/tmp/ws",
      repos: [{ repo: "billing", baseBranch: "main", branch: "feature/charge-keys", worktreePath: "/tmp/wt" }],
    });
    primed.close();
    const bare = new DatabaseSync(dbPath);
    bare.exec("DROP TABLE rounds;");
    bare.exec("PRAGMA user_version = 2;");
    bare.close();

    const store = openStore(dbPath);
    const round = store.addRound({
      project: "billing-api",
      feature: "charge-keys",
      repo: "billing",
      instruction: "Add the key",
      reply: "Stored it",
    });
    expect(round.summary).toBe("Add the key");
    expect(store.getFeature("billing-api", "charge-keys").repos[0]?.rounds).toHaveLength(1);
    store.close();
    const again = new DatabaseSync(dbPath);
    const version = again.prepare("PRAGMA user_version").get() as { user_version: number };
    expect(version.user_version).toBe(4);
    again.close();
  });

  it("records start and end shas and rejects a bad sha", () => {
    const store = openStore(tempDb());
    store.addProject({ slug: "billing-api" });
    const target = store.addTarget({ project: "billing-api", title: "keys", startSha: "ABC1234" });
    expect(target.startSha).toBe("abc1234");
    expect(target.endSha).toBeNull();
    const done = store.setResult(target.id, { status: "success", endSha: "def56789" });
    expect(done.endSha).toBe("def56789");
    expect(done.startSha).toBe("abc1234");
    const kept = store.setResult(target.id, { status: "failed", summary: "nope" });
    expect(kept.endSha).toBe("def56789");
    expect(kept.startSha).toBe("abc1234");
    expect(() => store.setTargetShas(target.id, { endSha: "not-a-sha" })).toThrow(StoreError);
    const cleared = store.setTargetShas(target.id, { startSha: null });
    expect(cleared.startSha).toBeNull();
    expect(cleared.endSha).toBe("def56789");
    store.close();
  });

  it("stores a round on one repo worktree and clips a missing summary", () => {
    const store = openStore(tempDb());
    store.addProject({ slug: "billing-api" });
    store.addRepo({ name: "billing", path: "/tmp/billing" });
    store.addRepo({ name: "ledger", path: "/tmp/ledger" });
    store.addFeature({
      project: "billing-api",
      slug: "charge-keys",
      workspacePath: "/tmp/ws",
      repos: [
        { repo: "billing", baseBranch: "main", branch: "feature/charge-keys", worktreePath: "/tmp/ws/billing" },
        { repo: "ledger", baseBranch: "main", branch: "feature/charge-keys", worktreePath: "/tmp/ws/ledger" },
      ],
    });
    const round = store.addRound({
      project: "billing-api",
      feature: "charge-keys",
      repo: "billing",
      summary: "add an idempotency key",
      outcome: "stored the key",
      instruction: "Add an idempotency key before capture.",
      reply: "Stored the key in src/charge.ts.",
      tools: "read src/charge.ts",
    });
    expect(round.tools).toBe("read src/charge.ts");
    const feature = store.getFeature("billing-api", "charge-keys");
    expect(feature.repos.find((repo) => repo.name === "billing")?.rounds.map((item) => item.id)).toEqual([round.id]);
    expect(feature.repos.find((repo) => repo.name === "ledger")?.rounds).toEqual([]);

    const clipped = store.addRound({
      project: "billing-api",
      feature: "charge-keys",
      repo: "billing",
      instruction: `please ${"x".repeat(120)}`,
      reply: "done\nand more",
    });
    expect(clipped.summary.endsWith("…")).toBe(true);
    expect(clipped.summary.length).toBe(80);
    expect(clipped.outcome).toBe("done and more");
    expect(clipped.tools).toBeNull();
    expect(feature.repos.find((repo) => repo.name === "billing")?.rounds[0]?.id).not.toBe(clipped.id);
    expect(store.getFeature("billing-api", "charge-keys").repos.find((repo) => repo.name === "billing")?.rounds[0]?.id).toBe(clipped.id);
    expect(() =>
      store.addRound({
        project: "billing-api",
        feature: "charge-keys",
        repo: "missing",
        instruction: "x",
        reply: "y",
      }),
    ).toThrow(/repo not on feature/);
    store.close();
  });
});
