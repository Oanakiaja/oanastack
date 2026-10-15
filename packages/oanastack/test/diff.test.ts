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

function gitText(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
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
  it("returns every row of a selected file when the cap is lifted", () => {
    const lines = ["@@ -1,450 +1,450 @@"];
    for (let i = 0; i < 450; i += 1) lines.push(` line ${i}`);
    const capped = parseSideBySide(lines.join("\n"));
    expect(capped.truncated).toBe(true);
    expect(capped.rows).toHaveLength(400);
    const full = parseSideBySide(lines.join("\n"), Number.POSITIVE_INFINITY);
    expect(full.truncated).toBe(false);
    expect(full.rows).toHaveLength(450);
    expect(full.rows[449]?.right).toBe("line 449");
  });

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

    const longBody = Array.from({ length: 420 }, (_, index) => `export const line${index} = ${index};`).join("\n") + "\n";
    writeFileSync(path.join(worktree, "src", "long.ts"), longBody);
    git(worktree, ["add", "src/long.ts"]);
    git(worktree, ["commit", "-m", "long file"]);
    const stacked = await app.request("/api/projects/billing-api/diff?feature=charge-keys&repo=billing&all=1&file=src/long.ts");
    const stackedView = (await stacked.json()) as { sections: Array<{ path: string; truncated: boolean; rows: unknown[] }> };
    const stackedLong = stackedView.sections.find((section) => section.path === "src/long.ts");
    expect(stackedLong?.truncated).toBe(true);
    expect(stackedLong?.rows.length).toBe(400);
    const whole = await app.request("/api/projects/billing-api/diff?feature=charge-keys&repo=billing&file=src/long.ts&full=1");
    expect(whole.status).toBe(200);
    const wholeView = (await whole.json()) as { file: string | null; truncated: boolean; rows: unknown[]; sections: Array<{ truncated: boolean; rows: unknown[] }> };
    expect(wholeView.file).toBe("src/long.ts");
    expect(wholeView.truncated).toBe(false);
    expect(wholeView.rows.length).toBeGreaterThan(400);
    expect(wholeView.sections[0]?.truncated).toBe(false);
    store.close();
  });

  it("records worktree HEAD and returns an incremental diff between targets", async () => {
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
    const app = createApp(store, { webRoot: null });

    const first = await app.request("/api/projects/billing-api/targets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "add a", feature: "charge-keys", repo: "billing" }),
    });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { id: number; startSha: string | null; endSha: string | null };
    expect(firstBody.startSha).toMatch(/^[0-9a-f]{40}$/);
    expect(firstBody.endSha).toBeNull();

    writeFileSync(path.join(worktree, "a.ts"), "export const a = 1;\n");
    git(worktree, ["add", "a.ts"]);
    git(worktree, ["commit", "-m", "add a"]);
    const firstResult = await app.request(`/api/targets/${firstBody.id}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "success", summary: "added a" }),
    });
    expect(firstResult.status).toBe(200);
    const firstDone = (await firstResult.json()) as { endSha: string | null };
    expect(firstDone.endSha).toMatch(/^[0-9a-f]{40}$/);
    expect(firstDone.endSha).not.toBe(firstBody.startSha);

    const second = await app.request("/api/projects/billing-api/targets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "add b", feature: "charge-keys", repo: "billing" }),
    });
    const secondBody = (await second.json()) as { id: number; startSha: string | null };
    expect(secondBody.startSha).toBe(firstDone.endSha);

    writeFileSync(path.join(worktree, "b.ts"), "export const b = 2;\n");
    git(worktree, ["add", "b.ts"]);
    git(worktree, ["commit", "-m", "add b"]);
    const secondResult = await app.request(`/api/targets/${secondBody.id}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "success", summary: "added b" }),
    });
    expect(secondResult.status).toBe(200);

    const whole = await app.request("/api/projects/billing-api/diff?feature=charge-keys&repo=billing&all=1");
    const wholeBody = (await whole.json()) as { files: Array<{ path: string }> };
    expect(wholeBody.files.map((file) => file.path).sort()).toEqual(["a.ts", "b.ts"]);

    const firstDiff = await app.request(`/api/projects/billing-api/diff?feature=charge-keys&repo=billing&all=1&target=${firstBody.id}`);
    expect(firstDiff.status).toBe(200);
    const firstView = (await firstDiff.json()) as {
      files: Array<{ path: string }>;
      sections: Array<{ path: string; rows: Array<{ right: string | null }> }>;
      range: { kind: string; ready: boolean; live: boolean; fromRef: string; toRef: string };
      error: string | null;
    };
    expect(firstView.error).toBeNull();
    expect(firstView.range).toMatchObject({ kind: "base", ready: true, live: false, fromRef: firstBody.startSha, toRef: firstDone.endSha });
    expect(firstView.files.map((file) => file.path)).toEqual(["a.ts"]);
    expect(firstView.sections[0]?.rows.some((row) => row.right?.includes("const a"))).toBe(true);

    const secondDiff = await app.request(`/api/projects/billing-api/diff?feature=charge-keys&repo=billing&all=1&target=${secondBody.id}`);
    const secondView = (await secondDiff.json()) as {
      files: Array<{ path: string }>;
      sections: Array<{ rows: Array<{ right: string | null }> }>;
      range: { kind: string; fromRef: string; ready: boolean };
    };
    expect(secondView.range).toMatchObject({ kind: "previous", fromRef: firstDone.endSha, ready: true });
    expect(secondView.files.map((file) => file.path)).toEqual(["b.ts"]);
    expect(secondView.sections[0]?.rows.some((row) => row.right?.includes("const b"))).toBe(true);

    const third = await app.request("/api/projects/billing-api/targets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "add c", feature: "charge-keys", repo: "billing" }),
    });
    const thirdBody = (await third.json()) as { id: number };
    writeFileSync(path.join(worktree, "c.ts"), "export const c = 3;\n");
    git(worktree, ["add", "c.ts"]);
    const live = await app.request(`/api/projects/billing-api/diff?feature=charge-keys&repo=billing&all=1&target=${thirdBody.id}`);
    const liveView = (await live.json()) as { files: Array<{ path: string }>; range: { live: boolean; ready: boolean; toRef: string } };
    expect(liveView.range).toMatchObject({ live: true, ready: true, toRef: "HEAD" });
    expect(liveView.files.map((file) => file.path)).toEqual(["c.ts"]);

    const missing = await app.request("/api/projects/billing-api/diff?feature=charge-keys&repo=billing&target=999");
    expect(missing.status).toBe(404);
    const bad = await app.request("/api/projects/billing-api/diff?feature=charge-keys&repo=billing&target=nope");
    expect(bad.status).toBe(400);
    store.close();
  });

  it("lists branches and commits, and a chosen commit changes the diff", async () => {
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
    writeFileSync(path.join(worktree, "a.ts"), "export const a = 1;\n");
    git(worktree, ["add", "a.ts"]);
    git(worktree, ["commit", "-m", "add a"]);
    const first = gitText(worktree, ["rev-parse", "HEAD"]);
    writeFileSync(path.join(worktree, "b.ts"), "export const b = 2;\n");
    git(worktree, ["add", "b.ts"]);
    git(worktree, ["commit", "-m", "add b"]);

    const app = createApp(store, { webRoot: null });
    const refs = await app.request("/api/projects/billing-api/refs?feature=charge-keys&repo=billing");
    expect(refs.status).toBe(200);
    const listed = (await refs.json()) as {
      branches: string[];
      head: string | null;
      commits: Array<{ sha: string; short: string; subject: string }>;
    };
    expect(listed.branches).toEqual(expect.arrayContaining(["main", "feature/charge-keys"]));
    expect(listed.head).toMatch(/^[0-9a-f]{40}$/);
    expect(listed.commits.map((commit) => commit.subject)).toEqual(expect.arrayContaining(["add a", "add b"]));
    expect(listed.commits.find((commit) => commit.subject === "add a")?.sha).toBe(first);

    const missing = await app.request("/api/projects/billing-api/refs");
    expect(missing.status).toBe(400);

    const paths = async (search: string) => {
      const response = await app.request(`/api/projects/billing-api/diff?feature=charge-keys&repo=billing&all=1${search}`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { files: Array<{ path: string }>; error: string | null };
      expect(body.error).toBeNull();
      return body.files.map((file) => file.path).sort();
    };
    const base = await paths("");
    const live = await paths("&left=main&right=WORKTREE");
    expect(live).toEqual(base);
    expect(live).toEqual(["a.ts", "b.ts"]);
    expect(await paths(`&left=main&right=${first}`)).toEqual(["a.ts"]);

    const escaped = await app.request("/api/projects/billing-api/diff?feature=charge-keys&repo=billing&left=../secret");
    expect(escaped.status).toBe(400);
    const dotted = await app.request("/api/projects/billing-api/diff?feature=charge-keys&repo=billing&right=feature/../main");
    expect(dotted.status).toBe(400);
    store.close();
  });
});
