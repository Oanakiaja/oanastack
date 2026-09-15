import type { ChildProcess } from "node:child_process";
import type { AutoApprovalDecision } from "../../types.js";

export type CodexSpawnFn = (
  command: string,
  args: string[],
  options: { stdio: ["pipe", "pipe", "pipe"]; env: NodeJS.ProcessEnv },
) => ChildProcess;

export interface CodexHarnessOptions {
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  spawn?: CodexSpawnFn;
  autoApproval?: AutoApprovalDecision | false;
  clientName?: string;
  clientTitle?: string;
  clientVersion?: string;
}

export const DEFAULT_CODEX_OPT_OUT_NOTIFICATIONS = [
  "item/agentMessage/delta",
  "item/reasoning/textDelta",
  "item/reasoning/summaryTextDelta",
  "item/commandExecution/outputDelta",
] as const;
