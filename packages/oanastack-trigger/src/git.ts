import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const NAME_LIMIT = 256;

export interface Checkout {
  branch: string | null;
  cwd: string | null;
  worktree: string | null;
}

/** Branch and worktree root for a herdr session directory. `git rev-parse --abbrev-ref HEAD` is the branch. */
export function locateCheckout(
  input: { cwd?: string | null; worktree?: string | null },
  gitBin = process.env.GIT_BIN?.trim() || "git",
): Checkout {
  const cwd = clean(input.cwd);
  const hinted = clean(input.worktree);
  const seen = new Set<string>();
  for (const dir of [hinted, cwd]) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    if (!existsSync(dir)) continue;
    // abbrev-ref needs a commit. A new branch with no commit still has a name via symbolic-ref.
    const branch =
      gitLine(gitBin, dir, ["rev-parse", "--abbrev-ref", "HEAD"]) ??
      gitLine(gitBin, dir, ["symbolic-ref", "--short", "HEAD"]);
    const top = gitLine(gitBin, dir, ["rev-parse", "--show-toplevel"]);
    if (!branch && !top) continue;
    return { branch, cwd, worktree: top ?? hinted };
  }
  return { branch: null, cwd, worktree: hinted };
}

function gitLine(bin: string, dir: string, args: string[]): string | null {
  const result = spawnSync(bin, ["-C", dir, ...args], {
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  const line = result.stdout.split(/\r?\n/).find((item) => item.trim().length > 0)?.trim() ?? "";
  if (!line) return null;
  return line.length > NAME_LIMIT ? line.slice(0, NAME_LIMIT) : line;
}

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
