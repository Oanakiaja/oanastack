import type { AgentKind } from "./types.js";

/** Codex and Claude flags that disable approval prompts. herdr passes these after `--`. */
export function yoloFlag(kind: AgentKind): string {
  if (kind === "codex") return "--dangerously-bypass-approvals-and-sandbox";
  return "--dangerously-skip-permissions";
}

export function withYolo(kind: AgentKind, extra: readonly string[], enabled = true): string[] {
  if (!enabled) return [...extra];
  const flag = yoloFlag(kind);
  if (extra.includes(flag)) return [...extra];
  return [flag, ...extra];
}

export interface HerdrStartSpec {
  agent: string;
  kind: AgentKind;
  pane: string;
  timeoutMs?: number;
  extra: string[];
  yolo: boolean;
}

export function herdrStartArgs(spec: HerdrStartSpec): string[] {
  const args = ["agent", "start", spec.agent, "--kind", spec.kind, "--pane", spec.pane];
  if (spec.timeoutMs !== undefined) args.push("--timeout", String(spec.timeoutMs));
  args.push("--", ...withYolo(spec.kind, spec.extra, spec.yolo));
  return args;
}
