import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface DetachedWorkerRequest {
  sessionId: string;
  stateDir: string;
  harness?: string;
  autoApprove?: boolean;
}

export interface SpawnedWorker {
  pid?: number;
  child: ChildProcess;
}

export function resolveWorkerCommand(): { command: string; prefixArgs: string[] } {
  const here = fileURLToPath(import.meta.url);
  const dir = path.dirname(here);
  const jsEntry = path.join(dir, "worker.js");
  const tsEntry = path.join(dir, "worker.ts");
  if (here.endsWith(".ts") || (existsSync(tsEntry) && !existsSync(jsEntry))) {
    return { command: process.execPath, prefixArgs: ["--import", "tsx", tsEntry] };
  }
  return { command: process.execPath, prefixArgs: [jsEntry] };
}

export function spawnDetachedWorker(request: DetachedWorkerRequest): SpawnedWorker {
  const { command, prefixArgs } = resolveWorkerCommand();
  const args = [
    ...prefixArgs,
    "--session-id",
    request.sessionId,
    "--state-dir",
    request.stateDir,
  ];
  if (request.harness) {
    args.push("--harness", request.harness);
  }
  if (request.autoApprove) {
    args.push("--auto-approve", "1");
  }
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    env: process.env,
    cwd: process.cwd(),
  });
  child.unref();
  return { pid: child.pid, child };
}
