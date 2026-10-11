import type { Project, Target } from "../types.js";

export function formatProjectLine(project: Project): string {
  const { progress } = project;
  return `${project.id}  ${project.slug}  ${progress.success}/${progress.total}  ${project.name}`;
}

export function formatProjectBlock(project: Project): string {
  const { progress } = project;
  const head = `${project.slug}  ${progress.success}/${progress.total} succeeded`;
  const lines = project.targets.map((target) => `  ${formatTargetLine(target)}`);
  return [head, ...lines].join("\n");
}

export function formatTargetLine(target: Target): string {
  const review = target.completions[0];
  const suffix = review ? `  review #${review.id}` : "";
  return `#${target.id}  ${target.status}  ${target.projectSlug}  ${target.title}${suffix}`;
}
