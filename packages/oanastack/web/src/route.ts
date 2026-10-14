export interface Route {
  project?: string;
  feature?: string;
  repo?: string;
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const head = parts[0];
  if (head === "p" || head === "map") {
    const project = parts[1];
    if (!project) return {};
    const feature = parts[2];
    const repo = parts[3];
    if (feature && repo) return { project, feature, repo };
    return { project };
  }
  if (head) return { project: head };
  return {};
}

export function readRoute(): Route {
  return parseHash(window.location.hash);
}

export function projectHash(slug: string): string {
  return `#/p/${encodeURIComponent(slug)}`;
}

export function worktreeHash(project: string, feature: string, repo: string): string {
  return `#/p/${[project, feature, repo].map(encodeURIComponent).join("/")}`;
}
