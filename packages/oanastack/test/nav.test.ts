import { describe, expect, it } from "vitest";
import { featureLabel, targetLabel } from "../web/src/labels";
import { distanceText, groupByBase, worktreeName, type WorktreeNode } from "../web/src/nav-tree";
import { parseHash, projectHash, worktreeHash } from "../web/src/route";

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
    expect(projectHash("billing-api")).toBe("#/p/billing-api");
    expect(worktreeHash("billing-api", "charge-keys", "billing")).toBe("#/p/billing-api/charge-keys/billing");
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
});
