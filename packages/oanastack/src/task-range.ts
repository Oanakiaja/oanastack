/** One target on a single feature worktree, oldest first. */
export interface TaskRangeInput {
  id: number;
  status: string;
  createdAt: string;
  startSha: string | null;
  endSha: string | null;
  worktreePath?: string | null;
}

export interface TaskRange {
  id: number;
  /** First target on the worktree is compared with base. Later targets use the previous end commit. */
  kind: "base" | "previous";
  fromRef: string | null;
  toRef: string | null;
  ready: boolean;
  /** Open tip only: diff `fromRef` against the worktree HEAD, including uncommitted edits. */
  live: boolean;
  message: string | null;
}

export function compareTaskOrder(a: { createdAt: string; id: number }, b: { createdAt: string; id: number }): number {
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  return a.id - b.id;
}

/** Targets that belong to one repo row under a feature. */
export function onWorktree<T extends { worktreePath: string | null }>(
  targets: T[],
  repo: { worktreePath: string | null },
  repoCount: number,
): T[] {
  return targets.filter((target) => {
    if (target.worktreePath && repo.worktreePath && target.worktreePath === repo.worktreePath) return true;
    if (!target.worktreePath && repoCount === 1) return true;
    return false;
  });
}

/**
 * Incremental ranges for targets on one worktree.
 * First: `startSha` or `baseBranch` → `endSha`. Later: previous `endSha` → this `endSha`.
 */
export function taskRanges(targets: TaskRangeInput[], baseBranch: string): TaskRange[] {
  const ordered = [...targets].sort(compareTaskOrder);
  const last = ordered[ordered.length - 1];
  return ordered.map((target, index) => {
    const previous = index === 0 ? null : ordered[index - 1];
    const fromRef = previous ? previous.endSha : (target.startSha ?? baseBranch);
    const kind: TaskRange["kind"] = previous ? "previous" : "base";
    if (target.endSha) {
      return {
        id: target.id,
        kind,
        fromRef,
        toRef: target.endSha,
        ready: Boolean(fromRef),
        live: false,
        message: fromRef ? null : "上一任务还没有 end commit。",
      };
    }
    const live = target.status === "open" && last?.id === target.id && Boolean(fromRef);
    return {
      id: target.id,
      kind,
      fromRef,
      toRef: live ? "HEAD" : null,
      ready: live,
      live,
      message: live ? null : fromRef ? "进行中，完成后才有任务 diff" : "上一任务还没有 end commit。",
    };
  });
}
