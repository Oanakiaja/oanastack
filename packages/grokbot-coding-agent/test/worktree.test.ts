import { execFileSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli/run.js";
import { createWorktree, parseWorktrunkList, worktrunkBin } from "../src/cli/worktree.js";
import { FakeHarness } from "../src/harness/fake.js";

const mockWt = fileURLToPath(new URL("./helpers/mock-wt.mjs", import.meta.url));
chmodSync(mockWt, 0o755);

async function initRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), "grokc-git-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "grokc@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "grokc"], { cwd: repo });
  await writeFile(path.join(repo, "README.md"), "hello worktree\n", "utf8");
  execFileSync("git", ["add", "README.md"], { cwd: repo });
  execFileSync("git", ["commit", "-m", "init"], { cwd: repo });
  return repo;
}

async function capture(argv: string[], options: { harness?: FakeHarness; stateDir?: string; cwd?: string } = {}) {
  const stateDir = options.stateDir ?? (await mkdtemp(path.join(tmpdir(), "grokc-wt-")));
  const harness = options.harness ?? new FakeHarness({ text: "wt-ok" });
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(argv, {
    harness,
    stateDir,
    cwd: options.cwd ?? stateDir,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n"), stateDir, harness };
}

describe("worktree helper (Worktrunk)", () => {
  const previousBin = process.env.WORKTRUNK_BIN;
  const previousState = process.env.WT_MOCK_STATE;
  let mockState: string;

  beforeEach(async () => {
    mockState = path.join(await mkdtemp(path.join(tmpdir(), "grokc-wt-mock-")), "state.json");
    await writeFile(mockState, JSON.stringify({ worktrees: [], calls: [] }), "utf8");
    process.env.WORKTRUNK_BIN = mockWt;
    process.env.WT_MOCK_STATE = mockState;
  });

  afterEach(() => {
    if (previousBin === undefined) {
      delete process.env.WORKTRUNK_BIN;
    } else {
      process.env.WORKTRUNK_BIN = previousBin;
    }
    if (previousState === undefined) {
      delete process.env.WT_MOCK_STATE;
    } else {
      process.env.WT_MOCK_STATE = previousState;
    }
  });

  it("creates via wt switch --create --no-cd --format json <name> [-b base]", async () => {
    const repo = await initRepo();
    const created = await createWorktree({ repo, name: "spike", base: "main" });
    expect(created.name).toBe("spike");
    expect(created.path).toBe(path.join(repo, "spike-wt"));
    expect(existsSync(created.path)).toBe(true);
    expect(worktrunkBin()).toBe(mockWt);
    const { readFile } = await import("node:fs/promises");
    const state = JSON.parse(await readFile(mockState, "utf8")) as { calls: string[][] };
    const createCall = state.calls.find((call) => call.includes("switch"));
    expect(createCall).toEqual(["-C", repo, "switch", "--create", "--no-cd", "--format", "json", "spike", "-b", "main"]);
    expect(state.calls.some((call) => call.includes("list") && call.includes("--format") && call.includes("json"))).toBe(
      true,
    );
  });

  it("grokc worktree create / list / remove shell out to wt", async () => {
    const repo = await initRepo();
    const created = await capture(["worktree", "create", "--repo", repo, "--name", "cli-spike", "--json"]);
    expect(created.code, created.stderr).toBe(0);
    const parsed = JSON.parse(created.stdout) as { action: string; data: { path: string; name: string } };
    expect(parsed.action).toBe("worktree.create");
    expect(parsed.data.name).toBe("cli-spike");
    expect(parsed.data.path).toBe(path.join(repo, "cli-spike-wt"));

    const listed = await capture(["worktree", "list", "--repo", repo, "--json"]);
    expect(listed.code, listed.stderr).toBe(0);
    expect(JSON.parse(listed.stdout).data.worktrees).toEqual([
      { name: "cli-spike", path: path.join(repo, "cli-spike-wt") },
    ]);

    const removed = await capture(["worktree", "remove", "--repo", repo, "--name", "cli-spike", "--json"]);
    expect(removed.code, removed.stderr).toBe(0);
    const { readFile } = await import("node:fs/promises");
    const state = JSON.parse(await readFile(mockState, "utf8")) as { calls: string[][] };
    const removeCall = state.calls.find((call) => call.includes("remove"));
    expect(removeCall).toEqual(["-C", repo, "remove", "--format", "json", "cli-spike"]);
    const empty = await capture(["worktree", "list", "--repo", repo, "--json"]);
    expect(JSON.parse(empty.stdout).data.worktrees).toEqual([]);
  });

  it("launch --worktree resolves cwd via wt", async () => {
    const repo = await initRepo();
    const harness = new FakeHarness({ text: "in-tree" });
    const launched = await capture(
      ["launch", "--prompt", "hello", "--worktree", "job-1", "--repo", repo, "--json"],
      { harness },
    );
    expect(launched.code, launched.stderr).toBe(0);
    const id = (JSON.parse(launched.stdout) as { data: { agent_id: string } }).data.agent_id;
    const got = await capture(["get", id, "--json"], { harness, stateDir: launched.stateDir });
    expect(got.stdout).toContain(path.join(repo, "job-1-wt"));
  });

  it("errors clearly when wt is missing", async () => {
    process.env.WORKTRUNK_BIN = "/definitely/not/a/worktrunk-binary";
    const repo = await initRepo();
    const result = await capture(["worktree", "create", "--repo", repo, "--name", "nope"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("brew install worktrunk");
    expect(result.stderr).toContain("WORKTRUNK_BIN");
  });

  it("parses wt list schema 1 and schema 2", () => {
    expect(parseWorktrunkList(JSON.stringify([{ branch: "a", path: "/tmp/a" }]))).toEqual([
      { name: "a", path: "/tmp/a" },
    ]);
    expect(
      parseWorktrunkList(
        JSON.stringify({
          schema: 2,
          items: [{ branch: "b", worktree: { path: "/tmp/b" } }],
        }),
      ),
    ).toEqual([{ name: "b", path: "/tmp/b" }]);
  });

  it("rejects unknown worktree subcommands and missing args", async () => {
    const missing = await capture(["worktree", "explode"]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("worktree <create|remove|list>");

    const noName = await capture(["worktree", "remove", "--repo", "/tmp"]);
    expect(noName.code).toBe(2);
    expect(noName.stderr).toContain("requires --name");

    const noRepo = await capture(["worktree", "list"]);
    expect(noRepo.code).toBe(2);
    expect(noRepo.stderr).toContain("requires --repo");
  });

  it("help mentions Worktrunk, approve, and --auto-approve", async () => {
    const help = await capture(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Worktrunk");
    expect(help.stdout).toContain("worktree remove");
    expect(help.stdout).toContain("worktree list");
    expect(help.stdout).toContain("approve");
    expect(help.stdout).toContain("--auto-approve");
    expect(help.stdout).not.toContain("gcac");
  });
});
