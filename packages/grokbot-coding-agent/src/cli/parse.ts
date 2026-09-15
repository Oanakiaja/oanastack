import {
  CLOUD_AGENT_ACTIONS,
  isCloudAgentAction,
  type CloudAgentAction,
  type CloudAgentRequest,
  type CloudAgentScope,
} from "../cloud-agent.js";
import { UsageError } from "../errors.js";
import { CLI_BIN_NAME } from "../version.js";
import {
  isApprovalDecision,
  isApprovalPolicy,
  isHarnessId,
  isSandboxMode,
  type HarnessId,
} from "../types.js";

export type ExtraCliAction = "worktree" | "_worker";

export interface ParsedCli {
  help: boolean;
  version: boolean;
  json: boolean;
  wait: boolean;
  noWait: boolean;
  request: CloudAgentRequest;
  harness?: HarnessId | "fake";
  stateDir?: string;
  extraAction?: ExtraCliAction;
  worktreeCommand?: WorktreeCommand;
  worktreeName?: string;
  worktreeRepo?: string;
  worktreeBase?: string;
  worktreeSlug?: string;
  worktreeForce?: boolean;
  autoApprove?: boolean;
  repo?: string;
}

export const WORKTREE_COMMANDS = ["create", "remove", "list"] as const;
export type WorktreeCommand = (typeof WORKTREE_COMMANDS)[number];

function isWorktreeCommand(value: string | undefined): value is WorktreeCommand {
  return Boolean(value && (WORKTREE_COMMANDS as readonly string[]).includes(value));
}

const FLAGS_WITH_VALUES = new Set([
  "--prompt",
  "--cwd",
  "--repo-url",
  "--repo_url",
  "--starting-ref",
  "--starting_ref",
  "--model",
  "--title",
  "--sandbox",
  "--approval-policy",
  "--harness",
  "--agent-id",
  "--agent_id",
  "--session-id",
  "--sessionId",
  "--scope",
  "--limit",
  "--path",
  "--out",
  "--state-dir",
  "--action",
  "--repo",
  "--name",
  "--base",
  "--worktree",
  "--request",
  "--request-id",
  "--decision",
]);

export function parseArgv(argv: string[]): ParsedCli {
  const args = [...argv];
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  while (args.length > 0) {
    const token = args.shift() as string;
    if (token === "--") {
      positionals.push(...args);
      break;
    }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        flags.set(token.slice(0, eq), token.slice(eq + 1));
        continue;
      }
      if (FLAGS_WITH_VALUES.has(token)) {
        const value = args.shift();
        if (value === undefined) {
          throw new UsageError(`Missing value for ${token}`);
        }
        flags.set(token, value);
        continue;
      }
      flags.set(token, true);
      continue;
    }
    if (token === "-h") {
      flags.set("--help", true);
      continue;
    }
    if (token === "-v") {
      flags.set("--version", true);
      continue;
    }
    positionals.push(token);
  }

  const help = flags.has("--help");
  const version = flags.has("--version");
  const json = flags.has("--json");
  const wait = flags.has("--wait");
  const noWait = flags.has("--no-wait");
  const actionToken = String(flags.get("--action") ?? positionals[0] ?? "");
  const extraAction: ExtraCliAction | undefined =
    actionToken === "worktree" || actionToken === "_worker" ? actionToken : undefined;
  const action = isCloudAgentAction(actionToken) ? actionToken : undefined;

  if (!help && !version && !action && !extraAction) {
    throw new UsageError(
      `Unknown or missing action. Expected one of: ${CLOUD_AGENT_ACTIONS.join(", ")}, worktree`,
    );
  }

  const request: CloudAgentRequest = {
    action: (action ?? "list") as CloudAgentAction,
    prompt: stringFlag(flags, "--prompt"),
    cwd: stringFlag(flags, "--cwd"),
    repo_url: stringFlag(flags, "--repo-url") ?? stringFlag(flags, "--repo_url") ?? stringFlag(flags, "--repo"),
    starting_ref: stringFlag(flags, "--starting-ref") ?? stringFlag(flags, "--starting_ref"),
    model: stringFlag(flags, "--model"),
    title: stringFlag(flags, "--title"),
    interrupt: flags.has("--interrupt"),
    include_archived: flags.has("--include-archived") || flags.has("--include_archived"),
    confirm: flags.has("--confirm"),
    path: stringFlag(flags, "--path") ?? stringFlag(flags, "--out"),
    requestId: stringFlag(flags, "--request") ?? stringFlag(flags, "--request-id"),
  };

  const id = stringFlag(flags, "--agent-id") ?? stringFlag(flags, "--agent_id") ?? stringFlag(flags, "--session-id") ?? stringFlag(flags, "--sessionId") ?? positionalId(action, positionals);
  if (id) {
    request.agent_id = id;
    request.sessionId = id;
  }

  const scope = stringFlag(flags, "--scope");
  if (scope === "launched" || scope === "all") {
    request.scope = scope as CloudAgentScope;
  } else if (scope) {
    throw new UsageError(`Invalid --scope ${scope}. Expected launched|all`);
  }

  const limit = stringFlag(flags, "--limit");
  if (limit) {
    request.limit = Number(limit);
  }

  const sandbox = stringFlag(flags, "--sandbox");
  if (sandbox) {
    if (!isSandboxMode(sandbox)) {
      throw new UsageError(`Invalid --sandbox ${sandbox}. Expected read-only|workspace-write|danger-full-access`);
    }
    request.sandbox = sandbox;
  }

  const approval = stringFlag(flags, "--approval-policy");
  if (approval) {
    if (!isApprovalPolicy(approval)) {
      throw new UsageError(`Invalid --approval-policy ${approval}`);
    }
    request.approvalPolicy = approval;
  }

  const decision = stringFlag(flags, "--decision");
  if (decision) {
    if (!isApprovalDecision(decision)) {
      throw new UsageError(
        `Invalid --decision ${decision}. Expected accept|acceptForSession|decline|cancel`,
      );
    }
    request.decision = decision;
  }

  if (action === "approve") {
    if (!request.requestId) {
      throw new UsageError("approve requires --request <requestId>");
    }
    if (!request.decision) {
      throw new UsageError("approve requires --decision accept|acceptForSession|decline|cancel");
    }
  }

  const harness = stringFlag(flags, "--harness");
  if (harness && harness !== "fake" && !isHarnessId(harness)) {
    throw new UsageError(`Unknown harness "${harness}"`);
  }

  let worktreeCommand: WorktreeCommand | undefined;
  let worktreeName = stringFlag(flags, "--name");
  let worktreeRepo = stringFlag(flags, "--repo") ?? stringFlag(flags, "--repo-url");
  let worktreeBase = stringFlag(flags, "--base") ?? stringFlag(flags, "--starting-ref") ?? stringFlag(flags, "--starting_ref");
  const worktreeForce = flags.has("--force");
  const autoApprove = flags.has("--auto-approve");
  if (extraAction === "worktree") {
    const sub = positionals[1];
    if (!isWorktreeCommand(sub)) {
      throw new UsageError(
        `Usage: ${CLI_BIN_NAME} worktree <create|remove|list> --repo <git-root> [--name <slug>] [--base <ref>] [--force]`,
      );
    }
    worktreeCommand = sub;
    if (!worktreeRepo) {
      throw new UsageError(`worktree ${sub} requires --repo <git-root>`);
    }
    if ((sub === "create" || sub === "remove") && !worktreeName) {
      throw new UsageError(`worktree ${sub} requires --name <slug>`);
    }
  }

  return {
    help,
    version,
    json,
    wait,
    noWait,
    request,
    harness: harness as HarnessId | "fake" | undefined,
    stateDir: stringFlag(flags, "--state-dir"),
    extraAction,
    worktreeCommand,
    worktreeName,
    worktreeRepo,
    worktreeBase,
    worktreeSlug: stringFlag(flags, "--worktree"),
    worktreeForce,
    autoApprove,
    repo: worktreeRepo,
  };
}

function stringFlag(flags: Map<string, string | boolean>, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function positionalId(action: CloudAgentAction | undefined, positionals: string[]): string | undefined {
  if (!action) {
    return undefined;
  }
  if (action === "launch" || action === "list" || action === "models") {
    return undefined;
  }
  return positionals[1];
}
