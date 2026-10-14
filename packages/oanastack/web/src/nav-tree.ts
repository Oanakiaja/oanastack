export interface WorktreeNode {
  featureSlug: string;
  featureStatus: string;
  repoName: string;
  baseBranch: string;
  branch: string;
  ahead: number | null;
  behind: number | null;
}

export interface BaseGroup {
  baseBranch: string;
  worktrees: WorktreeNode[];
}

/** project → base branch → worktree. Bases and worktrees are sorted by name. */
export function groupByBase(nodes: readonly WorktreeNode[]): BaseGroup[] {
  const groups: BaseGroup[] = [];
  for (const node of nodes) {
    let group = groups.find((item) => item.baseBranch === node.baseBranch);
    if (!group) {
      group = { baseBranch: node.baseBranch, worktrees: [] };
      groups.push(group);
    }
    group.worktrees.push(node);
  }
  groups.sort((a, b) => a.baseBranch.localeCompare(b.baseBranch));
  for (const group of groups) {
    group.worktrees.sort((a, b) => a.repoName.localeCompare(b.repoName) || a.featureSlug.localeCompare(b.featureSlug));
  }
  return groups;
}

/** Repo name. When one base has two worktrees for the same repo, append the feature. */
export function worktreeName(node: WorktreeNode, siblings: readonly WorktreeNode[]): string {
  const duplicated = siblings.some((other) => other !== node && other.repoName === node.repoName);
  return duplicated ? `${node.repoName} · ${node.featureSlug}` : node.repoName;
}

export function distanceText(ahead: number | null, behind: number | null): string | null {
  if (ahead === null || behind === null) return null;
  return `领先 ${ahead} · 落后 ${behind}`;
}
