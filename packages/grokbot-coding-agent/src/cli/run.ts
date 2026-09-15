import { createClient, type CloudAgentClient } from "../client.js";
import { SessionNotFoundError, UsageError } from "../errors.js";
import type { CodingAgentHarness } from "../harness/types.js";
import { runWorkerMain } from "./worker.js";
import { createWorktree, listWorktrees, removeWorktree } from "./worktree.js";
import { HELP_TEXT } from "./help.js";
import { parseArgv, type ParsedCli } from "./parse.js";
import { CLI_BIN_NAME, PACKAGE_NAME, PACKAGE_VERSION } from "../version.js";

export interface RunCliOptions {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  harness?: CodingAgentHarness;
  stateDir?: string;
  cwd?: string;
}

export async function runCli(argv: string[], options: RunCliOptions = {}): Promise<number> {
  const out = options.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const err = options.stderr ?? ((line) => process.stderr.write(`${line}\n`));

  if (argv[0] === "_worker") {
    return runWorkerMain(argv.slice(1));
  }

  let parsed;
  try {
    parsed = parseArgv(argv);
  } catch (error) {
    err(error instanceof Error ? error.message : String(error));
    return 2;
  }

  if (parsed.help) {
    out(HELP_TEXT.trimEnd());
    return 0;
  }
  if (parsed.version) {
    out(`${PACKAGE_NAME} ${PACKAGE_VERSION}`);
    return 0;
  }

  if (parsed.extraAction === "_worker") {
    return runWorkerMain(argv.slice(argv[0] === "_worker" ? 1 : 0));
  }

  if (parsed.extraAction === "worktree") {
    try {
      return await runWorktreeAction(parsed, out);
    } catch (error) {
      err(error instanceof Error ? error.message : String(error));
      return error instanceof UsageError ? 2 : 1;
    }
  }

  if (parsed.worktreeSlug) {
    try {
      const repo =
        parsed.repo ?? parsed.request.repo_url ?? parsed.request.cwd ?? options.cwd ?? process.cwd();
      const created = await createWorktree({
        repo,
        name: parsed.worktreeSlug,
        base: parsed.worktreeBase ?? parsed.request.starting_ref,
      });
      parsed.request.cwd = created.path;
    } catch (error) {
      err(error instanceof Error ? error.message : String(error));
      return error instanceof UsageError ? 2 : 1;
    }
  }

  const injectedHarness = Boolean(options.harness);
  const detach = parsed.noWait && !injectedHarness;
  const client: CloudAgentClient = createClient({
    harness: options.harness ?? parsed.harness ?? "codex",
    stateDir: options.stateDir ?? parsed.stateDir,
    cwd: options.cwd,
    background: detach ? "detach" : "inline",
    autoApprove: parsed.autoApprove,
  });

  try {
    const result = await client.run(parsed.request);
    printResult(out, parsed.json, result);
    if ((result.action === "launch" || result.action === "reply") && !parsed.noWait) {
      const watched = await client.watch(result.data.agent_id);
      if (parsed.wait) {
        printResult(out, parsed.json, { action: "watch", data: watched });
      }
    }
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      err(error.message);
      return 2;
    }
    if (error instanceof SessionNotFoundError) {
      err(error.message);
      return 1;
    }
    err(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await client.close({ drain: !parsed.noWait });
  }
}

async function runWorktreeAction(parsed: ParsedCli, out: (line: string) => void): Promise<number> {
  const repo = parsed.worktreeRepo as string;
  switch (parsed.worktreeCommand) {
    case "create": {
      const created = await createWorktree({
        repo,
        name: parsed.worktreeName as string,
        base: parsed.worktreeBase,
      });
      printResult(out, parsed.json, { action: "worktree.create", data: created });
      return 0;
    }
    case "remove": {
      const removed = await removeWorktree({
        repo,
        name: parsed.worktreeName as string,
        force: parsed.worktreeForce,
      });
      printResult(out, parsed.json, { action: "worktree.remove", data: removed });
      return 0;
    }
    case "list": {
      const listed = await listWorktrees({ repo });
      printResult(out, parsed.json, { action: "worktree.list", data: listed });
      return 0;
    }
    default:
      throw new UsageError(
        `Usage: ${CLI_BIN_NAME} worktree <create|remove|list> --repo <git-root> [--name <slug>]`,
      );
  }
}

function printResult(out: (line: string) => void, json: boolean, value: unknown): void {
  if (json) {
    out(JSON.stringify(value, null, 2));
    return;
  }
  out(formatHuman(value));
}

function formatHuman(value: unknown): string {
  if (!value || typeof value !== "object" || !("action" in value)) {
    return String(value);
  }
  const result = value as { action: string; data: unknown };
  switch (result.action) {
    case "launch": {
      const data = result.data as { agent_id: string; url: string };
      return `Launched ${data.agent_id}\n${data.url}`;
    }
    case "reply": {
      const data = result.data as {
        agent_id: string;
        runId: string;
        queued: boolean;
        interrupted: boolean;
        wasRunning: boolean;
      };
      if (data.queued) {
        return `Queued follow-up on ${data.agent_id} (run ${data.runId})`;
      }
      if (data.interrupted) {
        return `Interrupted ${data.agent_id} and delivered follow-up (run ${data.runId})`;
      }
      return `Sent follow-up to ${data.agent_id} (run ${data.runId})`;
    }
    case "list": {
      const rows = result.data as { agent_id: string; name: string; status: string; url: string }[];
      if (rows.length === 0) {
        return "No sessions.";
      }
      return rows.map((row) => `- ${row.agent_id} — ${row.name || "(unnamed)"} [${row.status}] ${row.url}`).join("\n");
    }
    case "dump": {
      const data = result.data as { path: string; lineCount: number };
      return `Wrote transcript to ${data.path} (${data.lineCount} lines)`;
    }
    case "models": {
      const models = result.data as { id: string; displayName?: string }[];
      return models.map((model) => `- ${model.id}${model.displayName ? ` (${model.displayName})` : ""}`).join("\n");
    }
    case "delete": {
      const data = result.data as { agent_id: string };
      return `Deleted ${data.agent_id}`;
    }
    case "worktree.create": {
      const data = result.data as { name: string; path: string; repo: string; base: string };
      return `Created worktree ${data.name} at ${data.path} (base ${data.base})`;
    }
    case "worktree.remove": {
      const data = result.data as { name: string; path?: string; forced: boolean };
      return `Removed worktree ${data.name}${data.path ? ` at ${data.path}` : ""}${data.forced ? " (forced)" : ""}`;
    }
    case "worktree.list": {
      const data = result.data as {
        worktrees: { name: string; path: string }[];
      };
      if (data.worktrees.length === 0) {
        return "No worktrees.";
      }
      return data.worktrees.map((row) => `- ${row.name}  ${row.path}`).join("\n");
    }
    case "approve": {
      const data = result.data as { agent_id: string; requestId: string; decision: string };
      return `Approved ${data.requestId} on ${data.agent_id} (${data.decision})`;
    }
    default: {
      const data = result.data as {
        agent_id?: string;
        name?: string;
        status?: string;
        url?: string;
        cwd?: string;
        error?: string;
        lastTurn?: { text?: string };
        waitingOnApproval?: boolean;
        pendingApprovals?: { id: string; kind: string; summary: string }[];
      };
      const lines = [
        data.agent_id ? `${result.action} ${data.agent_id}${data.name ? ` — ${data.name}` : ""}` : result.action,
      ];
      if (data.status) {
        lines.push(`Status: ${data.status}`);
      }
      if (data.waitingOnApproval) {
        lines.push("waitingOnApproval: true");
      }
      if (data.pendingApprovals?.length) {
        for (const pending of data.pendingApprovals) {
          lines.push(`pending ${pending.id} ${pending.kind} ${pending.summary}`.trim());
        }
      }
      if (data.url) {
        lines.push(`URL: ${data.url}`);
      }
      if (data.cwd) {
        lines.push(`cwd: ${data.cwd}`);
      }
      if (data.error) {
        lines.push(data.error);
      }
      if (data.lastTurn?.text) {
        lines.push(data.lastTurn.text);
      }
      return lines.join("\n");
    }
  }
}
