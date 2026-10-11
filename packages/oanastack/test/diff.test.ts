import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/api.js";
import { parseSideBySide } from "../src/git-stats.js";
import { openStore } from "../src/store.js";
import { createFeature, registerRepo } from "../src/workspace.js";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "oanastack-diff-"));
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
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

describe("worktree diff", () => {
  it("parses a unified diff into left and right rows", () => {
    const parsed = parseSideBySide(
      [
        "diff --git a/src/pay.ts b/src/pay.ts",
        "--- a/src/pay.ts",
        "+++ b/src/pay.ts",
        "@@ -1,3 +1,3 @@",
        " const keep = true;",
        "-const amount = 1;",
        "+const amount = 2;",
        " return amount;",
        "",
      ].join("\n"),
    );
    expect(parsed.truncated).toBe(false);
    expect(parsed.rows).toEqual([
      { kind: "context", leftNo: 1, rightNo: 1, left: "const keep = true;", right: "const keep = true;" },
      { kind: "change", leftNo: 2, rightNo: 2, left: "const amount = 1;", right: "const amount = 2;" },
      { kind: "context", leftNo: 3, rightNo: 3, left: "return amount;", right: "return amount;" },
    ]);
  });

  it("reports live ahead/behind and a side-by-side diff against the base", async () => {
    const root = tempDir();
    const billing = path.join(root, "src", "billing");
    initRepo(billing);
    const store = openStore(path.join(root, "oanastack.sqlite"));
    registerRepo(store, { name: "billing", path: billing });
    store.addProject({ slug: "billing-api", name: "Billing API" });
    createFeature(store, store.root, {
      project: "billing-api",
      slug: "charge-keys",
      repos: [{ name: "billing", base: "main" }],
    });
    const worktree = path.join(root, "projects", "billing-api", "features", "charge-keys", "billing");
    writeFileSync(path.join(worktree, "README.md"), "hi there\n");
    git(worktree, ["add", "README.md"]);
    git(worktree, ["commit", "-m", "edit amount"]);

    const app = createApp(store, { webRoot: null });
    const listed = await app.request("/api/projects/billing-api/worktrees");
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as {
      worktrees: Array<{ ahead: number | null; behind: number | null; added: number | null; removed: number | null; filesChanged: number | null; branch: string; baseBranch: string; error: string | null }>;
    };
    const row = body.worktrees[0];
    expect(row?.error).toBeNull();
    expect(row?.baseBranch).toBe("main");
    expect(row?.branch).toBe("feature/charge-keys");
    expect(row?.ahead).toBeGreaterThanOrEqual(1);
    expect(row?.behind).toBe(0);
    expect(row?.added).toBeGreaterThan(0);
    expect(row?.removed).toBeGreaterThan(0);
    expect(row?.filesChanged).toBe(1);

    const diff = await app.request("/api/projects/billing-api/diff?feature=charge-keys&repo=billing&file=../secret");
    expect(diff.status).toBe(200);
    const view = (await diff.json()) as {
      file: string | null;
      rows: Array<{ kind: string; left: string | null; right: string | null }>;
      error: string | null;
    };
    expect(view.error).toBeNull();
    expect(view.file).toBe("README.md");
    const changed = view.rows.find((item) => item.kind === "change");
    expect(changed?.left).toContain("hi");
    expect(changed?.right).toContain("hi there");

    const missing = await app.request("/api/projects/billing-api/diff?feature=charge-keys&repo=nope");
    expect(missing.status).toBe(404);
    const incomplete = await app.request("/api/projects/billing-api/diff");
    expect(incomplete.status).toBe(400);
    store.close();
  });
});
