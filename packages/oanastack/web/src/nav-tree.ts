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

export interface FeatureNode {
  slug: string;
  status: string;
  branch: string;
  repos: WorktreeNode[];
  children: FeatureNode[];
}

export interface FeatureRoot {
  baseBranch: string;
  features: FeatureNode[];
}

/**
 * Project tree: base branch → feature → repo worktrees, with nested features.
 * A feature hangs under another when its repo base is that feature's branch.
 */
export function featureTree(nodes: readonly WorktreeNode[]): FeatureRoot[] {
  const byFeature = new Map<string, WorktreeNode[]>();
  for (const node of nodes) {
    const list = byFeature.get(node.featureSlug);
    if (list) list.push(node);
    else byFeature.set(node.featureSlug, [node]);
  }

  const parentOf = new Map<string, string | null>();
  for (const [slug, links] of byFeature) {
    const votes = new Map<string, number>();
    for (const link of links) {
      const parent = parentFeature(link, byFeature);
      if (!parent) continue;
      votes.set(parent, (votes.get(parent) ?? 0) + 1);
    }
    const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    parentOf.set(slug, ranked[0]?.[0] ?? null);
  }
  dropCycles(parentOf);

  const placed = new Set<string>();
  function build(slug: string): FeatureNode {
    placed.add(slug);
    const links = [...(byFeature.get(slug) ?? [])].sort((a, b) => a.repoName.localeCompare(b.repoName));
    const children = [...parentOf.entries()]
      .filter(([, parent]) => parent === slug)
      .map(([child]) => child)
      .sort((a, b) => a.localeCompare(b))
      .map((child) => build(child));
    return {
      slug,
      status: links[0]?.featureStatus ?? "open",
      branch: majority(links.map((link) => link.branch)) || slug,
      repos: links,
      children,
    };
  }

  const roots = new Map<string, FeatureNode[]>();
  const rootSlugs = [...byFeature.keys()]
    .filter((slug) => !parentOf.get(slug))
    .sort((a, b) => a.localeCompare(b));
  for (const slug of rootSlugs) {
    const node = build(slug);
    const base = majority(node.repos.map((link) => link.baseBranch)) || "main";
    const list = roots.get(base);
    if (list) list.push(node);
    else roots.set(base, [node]);
  }

  return [...roots.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([baseBranch, features]) => ({
      baseBranch,
      features: features.sort((a, b) => a.slug.localeCompare(b.slug)),
    }));
}

function parentFeature(link: WorktreeNode, byFeature: ReadonlyMap<string, WorktreeNode[]>): string | null {
  const matches: string[] = [];
  for (const [slug, links] of byFeature) {
    if (slug === link.featureSlug) continue;
    if (links.some((other) => other.repoName === link.repoName && other.branch === link.baseBranch)) matches.push(slug);
  }
  matches.sort((a, b) => a.localeCompare(b));
  return matches[0] ?? null;
}

function dropCycles(parentOf: Map<string, string | null>): void {
  for (const start of [...parentOf.keys()]) {
    const seen: string[] = [];
    const index = new Map<string, number>();
    let current: string | null = start;
    while (current) {
      const at = index.get(current);
      if (at !== undefined) {
        for (const slug of seen.slice(at)) parentOf.set(slug, null);
        break;
      }
      index.set(current, seen.length);
      seen.push(current);
      current = parentOf.get(current) ?? null;
    }
  }
}

function majority(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? "";
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
