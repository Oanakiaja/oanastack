import type { Feature, Project, Repo, Target } from "../types.js";

export function formatProjectLine(project: Project): string {
  const { progress } = project;
  return `${project.id}  ${project.slug}  ${progress.success}/${progress.total}  ${project.name}`;
}

export function formatProjectBlock(project: Project): string {
  const { progress } = project;
  const head = `${project.slug}  ${progress.success}/${progress.total} succeeded`;
  const features = project.features.map((feature) => `  ${formatFeatureLine(feature)}`);
  const lines = project.targets.map((target) => `  ${formatTargetLine(target)}`);
  return [head, ...features, ...lines].join("\n");
}

export function formatFeatureLine(feature: Feature): string {
  const repos = feature.repos.map((repo) => `${repo.name} ${repo.baseBranch}->${repo.branch}`).join(", ");
  const place = feature.workspacePath ?? feature.archivePath ?? "";
  return `${feature.projectSlug}/${feature.slug}  ${feature.status}  ${repos || "no repos"}${place ? `  ${place}` : ""}`;
}

export function formatRepoLine(repo: Repo): string {
  const test = repo.testCommand ? `  test ${repo.testCommand}` : "";
  return `${repo.id}  ${repo.name}  ${repo.path}${test}`;
}

export function formatTargetLine(target: Target): string {
  const review = target.completions[0];
  const suffix = review ? `  review #${review.id}` : "";
  const feature = target.featureSlug ? `  feature ${target.featureSlug}` : "";
  return `#${target.id}  ${target.status}  ${target.projectSlug}  ${target.title}${feature}${suffix}`;
}
