import { createClient } from "../client.js";
import { UsageError } from "../errors.js";
import { SessionStore } from "../state.js";
import { isHarnessId, type CreateClientOptions } from "../types.js";

export async function runWorkerMain(argv: string[]): Promise<number> {
  const flags = parseWorkerArgv(argv);
  const sessionId = flags.get("--session-id") ?? flags.get("--sessionId");
  const stateDir = flags.get("--state-dir");
  const harness = flags.get("--harness") ?? "codex";
  const autoApprove = flags.get("--auto-approve") === "1" || flags.get("--auto-approve") === "true";
  if (!sessionId || !stateDir) {
    process.stderr.write("worker requires --session-id and --state-dir\n");
    return 2;
  }
  const harnessId: CreateClientOptions["harness"] =
    harness === "fake" || isHarnessId(harness) ? harness : "codex";
  const client = createClient({
    harness: harnessId,
    stateDir,
    background: "inline",
    autoApprove,
  });
  try {
    await client.runWorker(sessionId);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await new SessionStore(stateDir).patch(sessionId, { status: "error", error: message });
    } catch {
      // Session may already be gone.
    }
    process.stderr.write(`${message}\n`);
    return error instanceof UsageError ? 2 : 1;
  } finally {
    await client.close();
  }
}

function parseWorkerArgv(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  const args = [...argv];
  while (args.length > 0) {
    const token = args.shift() as string;
    if (!token.startsWith("--")) {
      continue;
    }
    const eq = token.indexOf("=");
    if (eq !== -1) {
      flags.set(token.slice(0, eq), token.slice(eq + 1));
      continue;
    }
    const value = args.shift();
    if (value !== undefined) {
      flags.set(token, value);
    }
  }
  return flags;
}
