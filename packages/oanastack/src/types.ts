export const TARGET_STATUSES = ["open", "success", "failed", "rejected"] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

export const RESULT_STATUSES = ["success", "failed", "rejected"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

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
  title: string;
  status: TargetStatus;
  summary: string | null;
  worktreePath: string | null;
  branch: string | null;
  herdrStatus: string | null;
  herdrResult: string | null;
  createdAt: string;
  updatedAt: string;
  completions: Completion[];
}

export interface Project {
  id: number;
  slug: string;
  name: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  progress: Progress;
  targets: Target[];
}

export interface Overview {
  dbPath: string;
  projects: Project[];
  progress: Progress;
}

export interface AddProjectInput {
  slug: string;
  name?: string | null;
  note?: string | null;
}

export interface AddTargetInput {
  project: string;
  title: string;
  worktreePath?: string | null;
  branch?: string | null;
}

export interface ResultInput {
  status: ResultStatus;
  summary?: string | null;
  worktreePath?: string | null;
  branch?: string | null;
  herdrStatus?: string | null;
  herdrResult?: string | null;
}

export interface CompletionInput {
  changed: string;
  why: string;
  verified: string;
  risks?: string | null;
  review?: string | null;
}
