export const TARGET_STATUSES = ["open", "success", "failed", "rejected"] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

export const RESULT_STATUSES = ["success", "failed", "rejected"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const FEATURE_STATUSES = ["open", "review", "done", "abandoned"] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export interface Progress {
  total: number;
  open: number;
  success: number;
  failed: number;
  rejected: number;
  /** Succeeded targets divided by all targets. Empty projects are 0. */
  ratio: number;
}

export interface Completion {
  id: number;
  targetId: number;
  changed: string;
  why: string;
  verified: string;
  risks: string | null;
  review: string | null;
  createdAt: string;
}

export interface Target {
  id: number;
  projectId: number;
  projectSlug: string;
  featureId: number | null;
  featureSlug: string | null;
  title: string;
  status: TargetStatus;
  summary: string | null;
  worktreePath: string | null;
  branch: string | null;
  herdrStatus: string | null;
  herdrResult: string | null;
  /** HEAD when the target was opened on a worktree. */
  startSha: string | null;
  /** HEAD when the target was finished (`result` or `done`). */
  endSha: string | null;
  createdAt: string;
  updatedAt: string;
  completions: Completion[];
}

export interface Repo {
  id: number;
  name: string;
  path: string;
  testCommand: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Round {
  id: number;
  featureRepoId: number;
  summary: string;
  outcome: string;
  instruction: string;
  reply: string;
  tools: string | null;
  createdAt: string;
}

export interface FeatureRepoLink {
  id: number;
  repoId: number;
  name: string;
  path: string;
  testCommand: string | null;
  baseBranch: string;
  branch: string;
  worktreePath: string | null;
  prUrl: string | null;
  rounds: Round[];
}

export interface AddRoundInput {
  project: string;
  feature: string;
  repo: string;
  instruction: string;
  reply: string;
  summary?: string | null;
  outcome?: string | null;
  tools?: string | null;
}

export interface Feature {
  id: number;
  projectId: number;
  projectSlug: string;
  slug: string;
  status: FeatureStatus;
  goal: string | null;
  workspacePath: string | null;
  archivePath: string | null;
  createdAt: string;
  updatedAt: string;
  repos: FeatureRepoLink[];
  targets: Target[];
}

export interface Project {
  id: number;
  slug: string;
  name: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  progress: Progress;
  features: Feature[];
  targets: Target[];
}

export interface Overview {
  dbPath: string;
  root: string;
  repos: Repo[];
  projects: Project[];
  progress: Progress;
}

export interface AddProjectInput {
  slug: string;
  name?: string | null;
  note?: string | null;
}

export interface AddRepoInput {
  name: string;
  path: string;
  testCommand?: string | null;
}

export interface AddFeatureInput {
  project: string;
  slug: string;
  goal?: string | null;
  workspacePath: string;
  repos: Array<{
    repo: string;
    baseBranch: string;
    branch: string;
    worktreePath: string;
  }>;
}

export interface AddTargetInput {
  project: string;
  title: string;
  worktreePath?: string | null;
  branch?: string | null;
  feature?: string | null;
  repo?: string | null;
  startSha?: string | null;
}

export interface LinkTargetInput {
  feature: string;
  project?: string | null;
  repo?: string | null;
}

export interface ResultInput {
  status: ResultStatus;
  summary?: string | null;
  worktreePath?: string | null;
  branch?: string | null;
  herdrStatus?: string | null;
  herdrResult?: string | null;
  endSha?: string | null;
}

export interface TargetShasInput {
  startSha?: string | null;
  endSha?: string | null;
}

export interface CompletionInput {
  changed: string;
  why: string;
  verified: string;
  risks?: string | null;
  review?: string | null;
}
