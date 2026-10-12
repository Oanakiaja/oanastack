import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/api.js";
import { buildDiffTree, filesUnder } from "../src/diff-tree.js";
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

  it("rolls added, removed, and file count up each directory", () => {
    const tree = buildDiffTree([
      { path: "src/api/keys.ts", status: "A", added: 8, removed: 0 },
      { path: "src/api/webhook.ts", status: "D", added: 0, removed: 3 },
      { path: "src/charge.ts", status: "M", added: 1, removed: 2 },
      { path: "docs/note.md", status: "R", added: 1, removed: 1 },
    ]);
    expect(tree.fileCount).toBe(4);
    expect(tree.added).toBe(10);
    expect(tree.removed).toBe(6);
    const src = tree.dirs.find((dir) => dir.name === "src");
    const api = src?.dirs.find((dir) => dir.name === "api");
    expect(src).toMatchObject({ fileCount: 3, added: 9, removed: 5 });
    expect(api).toMatchObject({ fileCount: 2, added: 8, removed: 3 });
    expect(api?.files.map((file) => file.status)).toEqual(["A", "D"]);
    expect(src?.files.map((file) => `${file.status} ${file.name}`)).toEqual(["M charge.ts"]);
    expect(filesUnder([{ path: "src/api/keys.ts" }, { path: "src/charge.ts" }, { path: "src2/other.ts" }], "src").map((file) => file.path)).toEqual([
      "src/api/keys.ts",
      "src/charge.ts",
    ]);
  });

  it("lists every changed file under a directory filter", async () => {
    const root = tempDir();
    const billing = path.join(root, "src", "billing");
    initRepo(billing);
    mkdirSync(path.join(billing, "src", "pay"), { recursive: true });
    writeFileSync(path.join(billing, "src", "charge.ts"), "export function charge() {\n  return 1;\n}\n");
    writeFileSync(path.join(billing, "src", "legacy.ts"), "export const legacy = true;\n");
    writeFileSync(path.join(billing, "src", "pay", "note.ts"), "export const note = 1;\n");
    git(billing, ["add", "."]);
    git(billing, ["commit", "-m", "base files"]);

    const store = openStore(path.join(root, "oanastack.sqlite"));
    registerRepo(store, { name: "billing", path: billing });
    store.addProject({ slug: "billing-api", name: "Billing API" });
    createFeature(store, store.root, {
      project: "billing-api",
      slug: "charge-keys",
      repos: [{ name: "billing", base: "main" }],
    });
    const worktree = path.join(root, "projects", "billing-api", "features", "charge-keys", "billing");
    writeFileSync(path.join(worktree, "src", "charge.ts"), "export function charge() {\n  return 2;\n}\n");
    rmSync(path.join(worktree, "src", "legacy.ts"));
    mkdirSync(path.join(worktree, "src", "api"), { recursive: true });
    writeFileSync(path.join(worktree, "src", "api", "keys.ts"), "export const keys = true;\n");
    writeFileSync(path.join(worktree, "src", "pay", "amount.ts"), "export const note = 1;\n");
    rmSync(path.join(worktree, "src", "pay", "note.ts"));
    git(worktree, ["add", "-A"]);
    git(worktree, ["commit", "-m", "reshape"]);

    const app = createApp(store, { webRoot: null });
    const diff = await app.request("/api/projects/billing-api/diff?feature=charge-keys&repo=billing&all=1");
    expect(diff.status).toBe(200);
    const view = (await diff.json()) as {
      files: Array<{ path: string; status: string; added: number; removed: number }>;
      sections: Array<{ path: string; status: string; rows: Array<{ right: string | null; left: string | null }> }>;
      error: string | null;
    };
    expect(view.error).toBeNull();
    const status = Object.fromEntries(view.files.map((file) => [file.path, file.status]));
    expect(status["src/api/keys.ts"]).toBe("A");
    expect(status["src/charge.ts"]).toBe("M");
    expect(status["src/legacy.ts"]).toBe("D");
    expect(status["src/pay/amount.ts"]).toBe("R");
    expect(view.sections.map((section) => section.path).sort()).toEqual([
      "src/api/keys.ts",
      "src/charge.ts",
      "src/legacy.ts",
      "src/pay/amount.ts",
    ]);
    const added = view.sections.find((section) => section.path === "src/api/keys.ts");
    expect(added?.rows.some((row) => row.right?.includes("keys"))).toBe(true);

    const filtered = await app.request("/api/projects/billing-api/diff?feature=charge-keys&repo=billing&dir=src/api");
    expect(filtered.status).toBe(200);
    const only = (await filtered.json()) as { sections: Array<{ path: string }>; files: Array<{ path: string }> };
    expect(only.sections.map((section) => section.path)).toEqual(["src/api/keys.ts"]);
    expect(only.files.length).toBeGreaterThan(1);

    const escaped = await app.request("/api/projects/billing-api/diff?feature=charge-keys&repo=billing&dir=../secret");
    expect(escaped.status).toBe(400);
    store.close();
  });
});
