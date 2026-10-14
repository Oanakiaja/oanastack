import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli/run.js";
import { openStore } from "../src/store.js";

function tempDb(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "oanastack-")), "oanastack.sqlite");
}

async function capture(argv: string[], dbPath = tempDb()) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(argv, {
    dbPath,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n"), dbPath };
}

describe("cli", () => {
  it("prints help and version", async () => {
    const help = await capture(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("oanastack");
    expect(help.stdout).toContain("serve");
    expect(help.stdout).toContain("project");
    expect(help.stdout).toContain("repo");
    expect(help.stdout).toContain("feature");
    const version = await capture(["--version"]);
    expect(version.code).toBe(0);
    expect(version.stdout).toContain("@oana/oanastack 0.1.0");
    const incomplete = await capture(["project"]);
    expect(incomplete.code).toBe(2);
    expect(incomplete.stdout).toContain("add");
  });

  it("logs a project, target, result, and completion as JSON", async () => {
    const dbPath = tempDb();
    const project = await capture(["p", "add", "billing-api", "--name", "Billing API", "--json"], dbPath);
    expect(project.code).toBe(0);
    expect(JSON.parse(project.stdout)).toMatchObject({ id: 1, slug: "billing-api", name: "Billing API" });

    const target = await capture(
      ["t", "add", "billing-api", "Idempotent charge keys", "--wt", "/tmp/billing", "--branch", "feature/idempotency", "--json"],
      dbPath,
    );
    expect(target.code).toBe(0);
    const created = JSON.parse(target.stdout) as { id: number };
    expect(created.id).toBe(1);

    const result = await capture(
      [
        "target",
        "result",
        "1",
        "success",
        "--summary",
        "one charge",
        "--herdr-status",
        "ok",
        "--herdr",
        "herdr apply finished",
        "--json",
      ],
      dbPath,
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      id: 1,
      status: "success",
      herdrStatus: "ok",
      herdrResult: "herdr apply finished",
      branch: "feature/idempotency",
    });

    const done = await capture(
      [
        "done",
        "1",
        "--data",
        JSON.stringify({
          changed: "store the key before capture",
          why: "retries double-charged",
          verified: "vitest",
          risks: "legacy clients",
          check: "place the order twice",
        }),
        "--json",
      ],
      dbPath,
    );
    expect(done.code).toBe(0);
    expect(JSON.parse(done.stdout)).toMatchObject({ id: 1, targetId: 1, review: "place the order twice" });

    const show = await capture(["show", "--json"], dbPath);
    expect(show.code).toBe(0);
    const overview = JSON.parse(show.stdout) as { progress: { success: number; total: number } };
    expect(overview.progress).toMatchObject({ success: 1, total: 1 });

    const listed = await capture(["project", "list"], dbPath);
    expect(listed.code).toBe(0);
    expect(listed.stdout).toContain("billing-api");
    expect(listed.stdout).toContain("1/1");
  });

  it("returns JSON errors for bad usage and conflicts", async () => {
    const dbPath = tempDb();
    await capture(["project", "add", "billing-api"], dbPath);
    const conflict = await capture(["project", "add", "billing-api", "--json"], dbPath);
    expect(conflict.code).toBe(1);
    expect(JSON.parse(conflict.stderr)).toMatchObject({ error: expect.stringContaining("already exists") });

    const bad = await capture(["target", "result", "1", "maybe", "--json"], dbPath);
    expect(bad.code).toBe(2);
    expect(JSON.parse(bad.stderr).error).toContain("status");

    const missing = await capture(["done", "1", "--json"], dbPath);
    expect(missing.code).toBe(2);
    expect(JSON.parse(missing.stderr).error).toContain("--changed");
  });

  it("logs one agent turn on a repo worktree", async () => {
    const dbPath = tempDb();
    const store = openStore(dbPath);
    store.addProject({ slug: "billing-api" });
    store.addRepo({ name: "billing", path: "/tmp/billing" });
    store.addFeature({
      project: "billing-api",
      slug: "charge-keys",
      workspacePath: "/tmp/ws",
      repos: [{ repo: "billing", baseBranch: "main", branch: "feature/charge-keys", worktreePath: "/tmp/wt" }],
    });
    store.close();

    const added = await capture(
      [
        "round",
        "add",
        "billing-api",
        "charge-keys",
        "--repo",
        "billing",
        "--data",
        JSON.stringify({
          summary: "add an idempotency key",
          outcome: "stored the key",
          instruction: "Add an idempotency key before capture.",
          reply: "Stored the key in src/charge.ts.",
          tools: "read src/charge.ts",
        }),
        "--json",
      ],
      dbPath,
    );
    expect(added.code).toBe(0);
    expect(JSON.parse(added.stdout)).toMatchObject({
      id: 1,
      summary: "add an idempotency key",
      outcome: "stored the key",
      tools: "read src/charge.ts",
    });

    const listed = await capture(["round", "ls", "billing-api", "charge-keys", "--repo", "billing", "--json"], dbPath);
    expect(listed.code).toBe(0);
    expect(JSON.parse(listed.stdout)).toMatchObject([{ id: 1, summary: "add an idempotency key" }]);

    const bare = await capture(["round", "add", "billing-api", "charge-keys", "--repo", "billing", "--json"], dbPath);
    expect(bare.code).toBe(2);
    expect(JSON.parse(bare.stderr).error).toContain("--instruction");
  });
});
