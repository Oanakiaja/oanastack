import type { Progress } from "../../src/types.ts";

export interface FeatureCounts {
  done: number;
  open: number;
  review: number;
  abandoned: number;
}

export interface BoardFeature {
  id: number;
  slug: string;
  status: string;
  goal: string | null;
}

export interface BoardTarget {
  id: number;
  title: string;
  status: string;
  summary: string | null;
  updatedAt: string;
  completions: readonly { id: number; review: string | null }[];
}

export interface BoardProject {
  slug: string;
  name: string;
  note: string | null;
  progress: Progress;
  features: readonly BoardFeature[];
  targets: readonly BoardTarget[];
}

export interface RecentResult<T> {
  slug: string;
  name: string;
  target: T;
}

export interface ReviewLine {
  key: string;
  projectSlug: string;
  projectName: string;
  title: string;
  detail: string | null;
  kind: "feature" | "check";
}

/** Home has no project. A slug selects that project only; it never falls back to the first one. */
export function pickProject<T extends { slug: string }>(projects: readonly T[], slug: string | undefined): T | undefined {
  if (!slug) return undefined;
  return projects.find((item) => item.slug === slug);
}

export function featureCounts(features: readonly { status: string }[]): FeatureCounts {
  return {
    done: features.filter((item) => item.status === "done").length,
    open: features.filter((item) => item.status === "open").length,
    review: features.filter((item) => item.status === "review").length,
    abandoned: features.filter((item) => item.status === "abandoned").length,
  };
}

export function sumProgress(projects: readonly { progress: Progress }[]): Progress {
  const progress: Progress = { total: 0, open: 0, success: 0, failed: 0, rejected: 0, ratio: 0 };
  for (const project of projects) {
    progress.total += project.progress.total;
    progress.open += project.progress.open;
    progress.success += project.progress.success;
    progress.failed += project.progress.failed;
    progress.rejected += project.progress.rejected;
  }
  progress.ratio = progress.total === 0 ? 0 : Math.round((progress.success / progress.total) * 10000) / 10000;
  return progress;
}

export function recentResults(projects: readonly BoardProject[], limit = 6): RecentResult<BoardTarget>[] {
  return projects
    .flatMap((project) => project.targets.map((target) => ({ slug: project.slug, name: project.name, target })))
    .sort((a, b) => (a.target.updatedAt < b.target.updatedAt ? 1 : a.target.updatedAt > b.target.updatedAt ? -1 : b.target.id - a.target.id))
    .slice(0, limit);
}

export function reviewLines(projects: readonly BoardProject[]): ReviewLine[] {
  const lines: ReviewLine[] = [];
  for (const project of projects) {
    for (const feature of project.features) {
      if (feature.status !== "review") continue;
      lines.push({
        key: `feature-${feature.id}`,
        projectSlug: project.slug,
        projectName: project.name,
        title: feature.slug,
        detail: feature.goal,
        kind: "feature",
      });
    }
    for (const target of project.targets) {
      for (const record of target.completions) {
        if (!record.review) continue;
        lines.push({
          key: `check-${record.id}`,
          projectSlug: project.slug,
          projectName: project.name,
          title: target.title,
          detail: record.review,
          kind: "check",
        });
      }
    }
  }
  return lines;
}
