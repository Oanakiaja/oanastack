export type Route =
  | { page: "board"; project?: string }
  | { page: "map"; project: string; feature?: string; repo?: string };

export function readRoute(): Route {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const head = parts[0];
  if (head === "map") {
    const project = parts[1];
    if (!project) return { page: "board" };
    return { page: "map", project, feature: parts[2], repo: parts[3] };
  }
  if (head === "p") return { page: "board", project: parts[1] };
  if (head) return { page: "board", project: head };
  return { page: "board" };
}

export function boardHash(slug: string): string {
  return `#/p/${encodeURIComponent(slug)}`;
}

export function mapHash(slug: string, feature?: string, repo?: string): string {
  const parts = ["map", slug];
  if (feature && repo) {
    parts.push(feature, repo);
  }
  return `#/${parts.map(encodeURIComponent).join("/")}`;
}
