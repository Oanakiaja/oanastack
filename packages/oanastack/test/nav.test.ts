import { describe, expect, it } from "vitest";
import { featureCounts, pickProject, recentResults, reviewLines, sumProgress, type BoardProject } from "../web/src/board";
import { highlightCode } from "../web/src/code-highlight";
import { iconKind, languageOf } from "../web/src/file-kind";
import { featureLabel, targetLabel } from "../web/src/labels";
import { statusMark, statusTone } from "../web/src/status-mark";
import { distanceText, featureTree, groupByBase, worktreeName, type WorktreeNode } from "../web/src/nav-tree";
import { parseHash, projectHash, worktreeHash } from "../web/src/route";

function boardTarget(input: {
  id: number;
  title: string;
  status: string;
  updatedAt: string;
  summary: string | null;
  review: string | null;
}): BoardProject["targets"][number] {
  return {
    id: input.id,
    title: input.title,
    status: input.status,
    summary: input.summary,
    updatedAt: input.updatedAt,
    completions: input.review ? [{ id: input.id, review: input.review }] : [],
  };
}

function boardProject(input: {
  slug: string;
  name: string;
  note: string | null;
  features: BoardProject["features"];
  targets: BoardProject["targets"];
  open?: number;
  success?: number;
  failed?: number;
  rejected?: number;
  review?: number;
}): BoardProject {
  const open = input.open ?? 0;
  const success = input.success ?? 0;
  const failed = input.failed ?? 0;
  const rejected = input.rejected ?? 0;
  const total = open + success + failed + rejected;
  return {
    slug: input.slug,
    name: input.name,
    note: input.note,
    features: input.features,
    targets: input.targets,
    progress: {
      total,
      open,
      success,
      failed,
      rejected,
      ratio: total === 0 ? 0 : success / total,
    },
  };
}

function node(partial: Partial<WorktreeNode> & Pick<WorktreeNode, "repoName" | "baseBranch" | "featureSlug">): WorktreeNode {
  return {
    featureStatus: "open",
    branch: `feature/${partial.featureSlug}`,
    ahead: 1,
    behind: 0,
    ...partial,
  };
}

describe("dashboard navigation", () => {
  it("groups worktrees under base branch and keeps the row sparse", () => {
    const billing = node({ repoName: "billing", baseBranch: "main", featureSlug: "charge-keys", ahead: 2, behind: 1 });
    const ledger = node({ repoName: "ledger", baseBranch: "main", featureSlug: "charge-keys", ahead: 1, behind: 0 });
    const other = node({ repoName: "billing", baseBranch: "develop", featureSlug: "notify", ahead: null, behind: null });
    const groups = groupByBase([ledger, other, billing]);
    expect(groups.map((group) => group.baseBranch)).toEqual(["develop", "main"]);
    expect(groups[1]?.worktrees.map((item) => item.repoName)).toEqual(["billing", "ledger"]);
    expect(worktreeName(billing, groups[1]?.worktrees ?? [])).toBe("billing");
    const again = node({ repoName: "billing", baseBranch: "main", featureSlug: "retry" });
    const shared = [billing, again];
    expect(worktreeName(billing, shared)).toBe("billing · charge-keys");
    expect(distanceText(2, 1)).toBe("领先 2 · 落后 1");
    expect(distanceText(null, 0)).toBeNull();
  });

  it("nests features under the base branch, then under the feature they branched from", () => {
    const billing = node({ repoName: "billing", baseBranch: "main", featureSlug: "charge-keys", ahead: 2, behind: 1 });
    const ledger = node({ repoName: "ledger", baseBranch: "main", featureSlug: "charge-keys", ahead: 1, behind: 0 });
    const nested = node({
      repoName: "billing",
      baseBranch: "feature/charge-keys",
      featureSlug: "retry",
      branch: "feature/retry",
    });
    const deeper = node({
      repoName: "billing",
      baseBranch: "feature/retry",
      featureSlug: "polish",
      branch: "feature/polish",
    });
    const other = node({ repoName: "notify", baseBranch: "develop", featureSlug: "inbox", branch: "feature/inbox" });
    const roots = featureTree([deeper, other, nested, ledger, billing]);
    expect(roots.map((root) => root.baseBranch)).toEqual(["develop", "main"]);
    expect(roots[0]?.features.map((feature) => feature.slug)).toEqual(["inbox"]);
    const charge = roots[1]?.features[0];
    expect(charge?.slug).toBe("charge-keys");
    expect(charge?.branch).toBe("feature/charge-keys");
    expect(charge?.repos.map((repo) => repo.repoName)).toEqual(["billing", "ledger"]);
    expect(charge?.children.map((feature) => feature.slug)).toEqual(["retry"]);
    expect(charge?.children[0]?.children.map((feature) => feature.slug)).toEqual(["polish"]);
    expect(charge?.children[0]?.repos.map((repo) => repo.repoName)).toEqual(["billing"]);
  });

  it("reads the overview hash and the worktree hash", () => {
    expect(parseHash("")).toEqual({});
    expect(parseHash("#/p/billing-api")).toEqual({ project: "billing-api" });
    expect(parseHash("#/p/billing-api/charge-keys/billing")).toEqual({
      project: "billing-api",
      feature: "charge-keys",
      repo: "billing",
    });
    expect(parseHash("#/map/billing-api/charge-keys/ledger")).toEqual({
      project: "billing-api",
      feature: "charge-keys",
      repo: "ledger",
    });
    expect(parseHash("#/")).toEqual({});
    expect(projectHash("billing-api")).toBe("#/p/billing-api");
    expect(worktreeHash("billing-api", "charge-keys", "billing")).toBe("#/p/billing-api/charge-keys/billing");
  });

  it("keeps the home board global instead of opening the first project", () => {
    const billing = boardProject({
      slug: "billing-api",
      name: "Billing API",
      note: "charges",
      success: 1,
      features: [{ id: 1, slug: "charge-keys", status: "open", goal: "one charge" }],
      targets: [boardTarget({ id: 1, title: "Idempotent charge keys", status: "success", updatedAt: "2026-10-14T00:00:00.000Z", summary: "one charge", review: "place the order twice" })],
    });
    const notify = boardProject({
      slug: "notify",
      name: "Notify",
      note: null,
      open: 1,
      review: 1,
      features: [{ id: 2, slug: "inbox", status: "review", goal: "read the queue" }],
      targets: [boardTarget({ id: 2, title: "Retry budget", status: "open", updatedAt: "2026-10-15T00:00:00.000Z", summary: null, review: null })],
    });
    const projects = [billing, notify];
    expect(pickProject(projects, undefined)).toBeUndefined();
    expect(pickProject(projects, "notify")?.name).toBe("Notify");
    expect(pickProject(projects, "missing")).toBeUndefined();
    expect(featureCounts(projects.flatMap((project) => project.features))).toEqual({ done: 0, open: 1, review: 1, abandoned: 0 });
    expect(sumProgress(projects)).toMatchObject({ total: 2, open: 1, success: 1, failed: 0, rejected: 0 });
    expect(recentResults(projects).map((item) => `${item.slug}:${item.target.title}`)).toEqual([
      "notify:Retry budget",
      "billing-api:Idempotent charge keys",
    ]);
    expect(reviewLines(projects).map((line) => `${line.projectSlug}:${line.title}`)).toEqual([
      "billing-api:Idempotent charge keys",
      "notify:inbox",
    ]);
  });

  it("names each status for the colored label", () => {
    expect(featureLabel("open")).toBe("进行中");
    expect(featureLabel("review")).toBe("等 review");
    expect(featureLabel("done")).toBe("已完成");
    expect(featureLabel("abandoned")).toBe("已放弃");
    expect(targetLabel("failed")).toBe("失败");
    expect(targetLabel("success")).toBe("成功");
    expect(targetLabel("rejected")).toBe("不做");
  });

  it("marks added files with + and deleted files with -", () => {
    expect(statusMark("A")).toBe("+");
    expect(statusMark("D")).toBe("-");
    expect(statusMark("M")).toBe("M");
    expect(statusMark("R")).toBe("R");
    expect(statusTone("A")).toBe("add");
    expect(statusTone("D")).toBe("del");
    expect(statusTone("M")).toBe("mod");
  });

  it("maps file extensions to an icon and a highlight language", () => {
    expect(iconKind("keys.ts")).toBe("typescript");
    expect(iconKind("App.tsx")).toBe("tsx");
    expect(iconKind("package.json")).toBe("json");
    expect(iconKind("README.md")).toBe("markdown");
    expect(iconKind("Dockerfile")).toBe("file");
    expect(languageOf("src/charge.ts")).toBe("typescript");
    expect(languageOf("src/api/keys.json")).toBe("json");
    expect(languageOf("script.sh")).toBe("bash");
    expect(languageOf("README")).toBeNull();
    const colored = highlightCode("export const keys = true;", "typescript");
    expect(colored).toContain("hljs-keyword");
    expect(colored).toContain("export");
    expect(highlightCode('{ "ok": 1 }', "json")).toContain("hljs-attr");
    expect(highlightCode("a < b", null)).toBe("a &lt; b");
  });
});
