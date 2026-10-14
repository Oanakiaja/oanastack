import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli/run.js";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "oanastack-wt-"));
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "oanastack test"]);
  writeFileSync(path.join(dir, "README.md"), "hi\n");
  git(dir, ["add", "README.md"]);
  git(dir, ["commit", "-m", "init"]);
}

function captureEnv(argv: string[], env: NodeJS.ProcessEnv) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return runCli(argv, {
    env,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  }).then((code) => ({ code, stdout: stdout.join("\n"), stderr: stderr.join("\n") }));
}

async function capture(argv: string[], dbPath: string, env: NodeJS.ProcessEnv = process.env) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(argv, {
    dbPath,
    env,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n"), dbPath };
}

describe("feature workspaces", () => {
  it("rejects a relative path, a non-git directory, and a nested path", async () => {
    const dbPath = path.join(tempDir(), "oanastack.sqlite");
    const relative = await capture(["repo", "add", "billing", "--path", "relative"], dbPath);
    expect(relative.code).not.toBe(0);
    expect(relative.stderr).toContain("absolute");

    const empty = tempDir();
    const missingGit = await capture(["repo", "add", "billing", "--path", empty], dbPath);
    expect(missingGit.code).not.toBe(0);
    expect(missingGit.stderr).toContain("git");

    const repo = path.join(tempDir(), "billing");
    initRepo(repo);
    const nested = path.join(repo, "src");
    mkdirSync(nested);
    const nestedAdd = await capture(["repo", "add", "billing", "--path", nested], dbPath);
    expect(nestedAdd.code).not.toBe(0);
    expect(nestedAdd.stderr).toContain(repo);
  });

  it("creates one worktree per repo and refreshes agent context", async () => {
    const root = tempDir();
    const dbPath = path.join(root, "oanastack.sqlite");
    const billing = path.join(root, "src", "billing");
    const ledger = path.join(root, "src", "ledger");
    initRepo(billing);
    initRepo(ledger);

    expect((await capture(["repo", "add", "billing", "--path", billing, "--test", "true", "--json"], dbPath)).code).toBe(0);
    expect((await capture(["repo", "add", "ledger", "--path", ledger, "--json"], dbPath)).code).toBe(0);
    expect((await capture(["project", "add", "billing-api", "--json"], dbPath)).code).toBe(0);

    const created = await capture(
      [
        "feature",
        "new",
        "billing-api",
        "charge-keys",
        "--goal",
        "One charge per checkout",
        "--repo",
        "billing:main",
        "--repo",
        "ledger:main",
        "--json",
      ],
      dbPath,
    );
    expect(created.code, created.stderr).toBe(0);
    const feature = JSON.parse(created.stdout) as { status: string; workspacePath: string; repos: Array<{ name: string; branch: string }> };
    expect(feature.status).toBe("open");
    expect(feature.repos.map((repo) => repo.name).sort()).toEqual(["billing", "ledger"]);
    expect(feature.repos.every((repo) => repo.branch === "feature/charge-keys")).toBe(true);

    const workspace = path.join(root, "projects", "billing-api", "features", "charge-keys");
    expect(feature.workspacePath).toBe(workspace);
    expect(existsSync(path.join(workspace, "billing"))).toBe(true);
    expect(existsSync(path.join(workspace, "ledger"))).toBe(true);
    const head = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: path.join(workspace, "billing"), encoding: "utf8" });
    expect(head.stdout.trim()).toBe("feature/charge-keys");
    const porcelain = spawnSync("git", ["status", "--porcelain"], { cwd: path.join(workspace, "billing"), encoding: "utf8" });
    expect(porcelain.stdout.trim()).toBe("");

    const meta = JSON.parse(readFileSync(path.join(workspace, ".oanastack", "feature.json"), "utf8")) as { repos: unknown[] };
    expect(meta.repos).toHaveLength(2);
    expect(existsSync(path.join(workspace, ".oanastack", "tasks.md"))).toBe(true);
    expect(existsSync(path.join(workspace, ".oanastack", "context.md"))).toBe(true);
    const tasksNote = "custom task line";
    writeFileSync(path.join(workspace, ".oanastack", "tasks.md"), `# charge-keys\n\n${tasksNote}\n`, "utf8");

    const target = await capture(
      ["target", "add", "billing-api", "Idempotent charge keys", "--feature", "charge-keys", "--repo", "billing", "--json"],
      dbPath,
    );
    expect(target.code, target.stderr).toBe(0);
    const agents = readFileSync(path.join(workspace, "AGENTS.md"), "utf8");
    expect(agents).toContain("One charge per checkout");
    expect(agents).toContain("Idempotent charge keys");
    expect(agents).toContain(tasksNote);
    expect(agents).toContain("oanastack target add");
    expect(readFileSync(path.join(workspace, ".oanastack", "tasks.md"), "utf8")).toContain(tasksNote);
    expect(readFileSync(path.join(workspace, ".oanastack", "context.md"), "utf8")).toContain("Idempotent charge keys");
  });

  it("merges the latest base locally, runs tests, and refuses a failing test", async () => {
    const root = tempDir();
    const dbPath = path.join(root, "oanastack.sqlite");
    const repo = path.join(root, "src", "billing");
    initRepo(repo);
    await capture(["repo", "add", "billing", "--path", repo, "--test", "true"], dbPath);
    await capture(["project", "add", "billing-api"], dbPath);
    const created = await capture(
      ["feature", "new", "billing-api", "charge-keys", "--repo", "billing", "--from", "main", "--json"],
      dbPath,
    );
    expect(created.code, created.stderr).toBe(0);
    const workspace = path.join(root, "projects", "billing-api", "features", "charge-keys", "billing");

    writeFileSync(path.join(repo, "from-base.txt"), "base\n");
    git(repo, ["add", "from-base.txt"]);
    git(repo, ["commit", "-m", "base move"]);
    writeFileSync(path.join(workspace, "from-feature.txt"), "feature\n");
    git(workspace, ["add", "from-feature.txt"]);
    git(workspace, ["commit", "-m", "feature move"]);

    const merged = await capture(["feature", "merge", "charge-keys", "--project", "billing-api", "--local", "--json"], dbPath);
    expect(merged.code, merged.stderr).toBe(0);
    expect(JSON.parse(merged.stdout)).toMatchObject({ status: "review" });
    expect(readFileSync(path.join(workspace, "from-base.txt"), "utf8")).toBe("base\n");
    expect(readFileSync(path.join(repo, "from-feature.txt"), "utf8")).toBe("feature\n");
    expect(readFileSync(path.join(root, "projects", "billing-api", "features", "charge-keys", "AGENTS.md"), "utf8")).toContain("review");

    const dirty = path.join(tempDir(), "oanastack.sqlite");
    const dirtyRepo = path.join(tempDir(), "billing");
    initRepo(dirtyRepo);
    await capture(["repo", "add", "billing", "--path", dirtyRepo, "--test", "exit 1"], dirty);
    await capture(["project", "add", "billing-api"], dirty);
    expect((await capture(["feature", "new", "billing-api", "charge-keys", "--repo", "billing:main"], dirty)).code).toBe(0);
    const dirtyWt = path.join(path.dirname(dirty), "projects", "billing-api", "features", "charge-keys", "billing");
    writeFileSync(path.join(dirtyRepo, "from-base.txt"), "base\n");
    git(dirtyRepo, ["add", "from-base.txt"]);
    git(dirtyRepo, ["commit", "-m", "base move"]);
    writeFileSync(path.join(dirtyWt, "from-feature.txt"), "feature\n");
    git(dirtyWt, ["add", "from-feature.txt"]);
    git(dirtyWt, ["commit", "-m", "feature move"]);
    const failed = await capture(["feature", "merge", "charge-keys", "--local", "--json"], dirty);
    expect(failed.code).not.toBe(0);
    expect(failed.stderr).toContain("tests failed");
    const status = JSON.parse((await capture(["feature", "status", "charge-keys", "--json"], dirty)).stdout) as { status: string };
    expect(status.status).toBe("open");
    expect(existsSync(path.join(dirtyWt, "from-base.txt"))).toBe(true);
    expect(existsSync(path.join(dirtyRepo, "from-feature.txt"))).toBe(false);
  });

  it("closes only a merged clean feature and abandons an unmerged one", async () => {
    const root = tempDir();
    const dbPath = path.join(root, "oanastack.sqlite");
    const repo = path.join(root, "src", "billing");
    initRepo(repo);
    await capture(["repo", "add", "billing", "--path", repo], dbPath);
    await capture(["project", "add", "billing-api"], dbPath);
    await capture(["feature", "new", "billing-api", "charge-keys", "--repo", "billing:main"], dbPath);
    const workspace = path.join(root, "projects", "billing-api", "features", "charge-keys");
    const worktree = path.join(workspace, "billing");
    writeFileSync(path.join(worktree, "from-feature.txt"), "feature\n");
    git(worktree, ["add", "from-feature.txt"]);
    git(worktree, ["commit", "-m", "feature move"]);

    const unmerged = await capture(["feature", "close", "charge-keys", "--json"], dbPath);
    expect(unmerged.code).not.toBe(0);
    expect(unmerged.stderr).toContain("not merged");
    expect(existsSync(worktree)).toBe(true);

    writeFileSync(path.join(worktree, "notes.txt"), "dirty\n");
    const dirty = await capture(["feature", "close", "charge-keys", "--abandon", "--json"], dbPath);
    expect(dirty.code).not.toBe(0);
    expect(dirty.stderr).toContain("not clean");
    expect(existsSync(path.join(worktree, "notes.txt"))).toBe(true);

    const abandonRoot = tempDir();
    const abandonDb = path.join(abandonRoot, "oanastack.sqlite");
    const abandonRepo = path.join(abandonRoot, "src", "billing");
    initRepo(abandonRepo);
    await capture(["repo", "add", "billing", "--path", abandonRepo], abandonDb);
    await capture(["project", "add", "billing-api"], abandonDb);
    await capture(["feature", "new", "billing-api", "drop-cookie", "--repo", "billing", "--from", "main"], abandonDb);
    const abandoned = await capture(["feature", "close", "drop-cookie", "--abandon", "--json"], abandonDb);
    expect(abandoned.code, abandoned.stderr).toBe(0);
    expect(JSON.parse(abandoned.stdout)).toMatchObject({ status: "abandoned" });
    const archive = path.join(abandonRoot, "projects", "billing-api", "archive", "drop-cookie");
    expect(existsSync(path.join(archive, "AGENTS.md"))).toBe(true);
    expect(readFileSync(path.join(archive, "AGENTS.md"), "utf8")).toContain("abandoned");
    expect(existsSync(path.join(abandonRoot, "projects", "billing-api", "features", "drop-cookie"))).toBe(false);
    const branch = spawnSync("git", ["show-ref", "--verify", "--quiet", "refs/heads/feature/drop-cookie"], { cwd: abandonRepo });
    expect(branch.status).not.toBe(0);

    // notes.txt is still untracked; clean it before the successful close.
    spawnSync("rm", ["-f", path.join(worktree, "notes.txt")]);
    const merged = await capture(["feature", "merge", "charge-keys", "--local", "--json"], dbPath);
    expect(merged.code, merged.stderr).toBe(0);
    const closed = await capture(["feature", "close", "charge-keys", "--json"], dbPath);
    expect(closed.code, closed.stderr).toBe(0);
    expect(JSON.parse(closed.stdout)).toMatchObject({ status: "done" });
    expect(existsSync(worktree)).toBe(false);
    const doneArchive = path.join(root, "projects", "billing-api", "archive", "charge-keys");
    expect(readFileSync(path.join(doneArchive, ".oanastack", "feature.json"), "utf8")).toContain("done");
    expect(readFileSync(path.join(doneArchive, "AGENTS.md"), "utf8")).toContain("done");
  });

  it("opens a pull request with a fake gh and records the URL", async () => {
    const root = tempDir();
    const dbPath = path.join(root, "oanastack.sqlite");
    const repo = path.join(root, "src", "billing");
    const bare = path.join(root, "bare.git");
    const gh = path.join(root, "gh");
    initRepo(repo);
    git(root, ["init", "--bare", "-b", "main", bare]);
    git(repo, ["remote", "add", "origin", bare]);
    git(repo, ["push", "-u", "origin", "main"]);
    writeFileSync(gh, "#!/bin/sh\nif [ \"$1\" = \"pr\" ] && [ \"$2\" = \"view\" ]; then exit 1; fi\nif [ \"$1\" = \"pr\" ] && [ \"$2\" = \"create\" ]; then echo \"https://example.test/pull/7\"; exit 0; fi\necho unexpected >&2\nexit 1\n");
    chmodSync(gh, 0o755);

    await capture(["repo", "add", "billing", "--path", repo], dbPath);
    await capture(["project", "add", "billing-api"], dbPath);
    expect((await capture(["feature", "new", "billing-api", "charge-keys", "--repo", "billing:main"], dbPath)).code).toBe(0);
    const worktree = path.join(root, "projects", "billing-api", "features", "charge-keys", "billing");
    writeFileSync(path.join(worktree, "from-feature.txt"), "feature\n");
    git(worktree, ["add", "from-feature.txt"]);
    git(worktree, ["commit", "-m", "feature move"]);

    const env = { ...process.env, OANASTACK_GH: gh };
    const merged = await capture(["feature", "merge", "charge-keys", "--json"], dbPath, env);
    expect(merged.code, merged.stderr).toBe(0);
    const body = JSON.parse(merged.stdout) as { status: string; repos: Array<{ prUrl: string | null }> };
    expect(body.status).toBe("review");
    expect(body.repos[0]?.prUrl).toBe("https://example.test/pull/7");
  });

  it("stores the root pointer from config root", async () => {
    const dir = tempDir();
    const config = path.join(dir, "oanastack.json");
    const root = path.join(dir, "stack");
    const env = { ...process.env, OANASTACK_CONFIG: config };
    delete env.OANASTACK_HOME;
    delete env.OANASTACK_DB;
    const set = await captureEnv(["config", "root", root, "--json"], env);
    expect(set.code, set.stderr).toBe(0);
    expect(JSON.parse(readFileSync(config, "utf8"))).toMatchObject({ root });
    expect(existsSync(root)).toBe(true);
    const added = await captureEnv(["project", "add", "billing-api", "--json"], env);
    expect(added.code, added.stderr).toBe(0);
    expect(existsSync(path.join(root, "oanastack.sqlite"))).toBe(true);
  });
});
