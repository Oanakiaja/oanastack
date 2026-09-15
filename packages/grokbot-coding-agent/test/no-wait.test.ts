import { execFileSync, spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "../src/client.js";
import { FakeHarness } from "../src/harness/fake.js";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliJs = path.join(repoRoot, "dist/cli.js");

function runCliProcess(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string; ms: number }> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [cliJs, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr, ms: Date.now() - started });
    });
  });
}

function parseLaunch(stdout: string): { agent_id: string; url: string } {
  const parsed = JSON.parse(stdout) as { data: { agent_id: string; url: string } };
  return parsed.data;
}

describe("detached --no-wait worker", () => {
  beforeAll(() => {
    execFileSync("npm", ["run", "build"], { cwd: repoRoot, stdio: "pipe" });
  });

  it("returns in << turn time and two sequential launches finish concurrently", async () => {
    const delay = 500;
    const stateDir = await mkdtemp(path.join(tmpdir(), "grokc-detach-"));
    const env = {
      GROKBOT_CODING_AGENT_CLI_FAKE: "1",
      GROKBOT_CODING_AGENT_CLI_FAKE_DELAY_MS: String(delay),
    };
    const started = Date.now();
    const first = await runCliProcess(
      [
        "launch",
        "--harness",
        "fake",
        "--no-wait",
        "--json",
        "--prompt",
        "one",
        "--cwd",
        stateDir,
        "--state-dir",
        stateDir,
      ],
      env,
    );
    const second = await runCliProcess(
      [
        "launch",
        "--harness",
        "fake",
        "--no-wait",
        "--json",
        "--prompt",
        "two",
        "--cwd",
        stateDir,
        "--state-dir",
        stateDir,
      ],
      env,
    );
    const parentMs = Date.now() - started;
    expect(first.code, first.stderr).toBe(0);
    expect(second.code, second.stderr).toBe(0);
    expect(parentMs).toBeLessThan(delay);
    const a = parseLaunch(first.stdout);
    const b = parseLaunch(second.stdout);
    expect(a.agent_id).toBeTruthy();
    expect(a.url).toBe(`grokc://${a.agent_id}`);
    expect(b.agent_id).not.toBe(a.agent_id);

    const client = createClient({ harness: new FakeHarness(), stateDir });
    const listed = await client.list({ scope: "launched" });
    expect(listed.map((row) => row.agent_id).sort()).toEqual([a.agent_id, b.agent_id].sort());
    const [settledA, settledB] = await Promise.all([client.watch(a.agent_id), client.watch(b.agent_id)]);
    expect(settledA.status).toBe("finished");
    expect(settledB.status).toBe("finished");
    expect(settledA.lastTurn?.text).toContain("one");
    expect(settledB.lastTurn?.text).toContain("two");
    const wallMs = Date.now() - started;
    // Two 500ms turns plus worker boot. Serial close() would be >= 2 * delay
    // after both parents returned; overlapping workers stay well under that.
    expect(wallMs).toBeLessThan(delay * 2.4);
    await client.close({ drain: false });
  });
});
