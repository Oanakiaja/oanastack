import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createClient } from "../src/client.js";
import { runCli } from "../src/cli/run.js";
import { FakeHarness } from "../src/harness/fake.js";
import { HELP_TEXT } from "../src/cli/help.js";

async function capture(
  argv: string[],
  options: { harness?: FakeHarness; stateDir?: string } = {},
) {
  const stateDir = options.stateDir ?? (await mkdtemp(path.join(tmpdir(), "grokc-cli-")));
  const harness = options.harness ?? new FakeHarness();
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(argv, {
    harness,
    stateDir,
    cwd: stateDir,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n"), stateDir, harness };
}

describe("CLI CloudAgent verbs", () => {
  it("prints help and version", async () => {
    const help = await capture(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("launch");
    expect(help.stdout).toContain("grokc");
    expect(help.stdout).not.toContain("gcac");
    expect(help.stdout).toContain(HELP_TEXT.slice(0, 20));
    const version = await capture(["--version"]);
    expect(version.stdout).toMatch(/@oana\/grokbot-coding-agent \d+\.\d+\.\d+/);
  });

  it("launch / reply / get / list / dump via argv", async () => {
    const harness = new FakeHarness({ text: "cli-ok" });
    const launched = await capture(
      ["launch", "--prompt", "hello", "--cwd", process.cwd(), "--json", "--title", "Demo"],
      { harness },
    );
    expect(launched.code).toBe(0);
    const launchJson = JSON.parse(launched.stdout) as {
      action: string;
      data: { agent_id: string; url: string };
    };
    expect(launchJson.action).toBe("launch");
    const id = launchJson.data.agent_id;
    const stateDir = launched.stateDir;

    const listed = await capture(["list", "--json", "--scope", "launched"], { harness, stateDir });
    expect(listed.code).toBe(0);
    expect(listed.stdout).toContain(id);

    const got = await capture(["get", id, "--json"], { harness, stateDir });
    expect(got.code).toBe(0);
    expect(got.stdout).toContain("cli-ok");

    const replied = await capture(["reply", id, "--prompt", "again", "--json"], { harness, stateDir });
    expect(replied.code).toBe(0);
    expect(replied.stdout).toContain(id);

    const dumped = await capture(["dump", id, "--json"], { harness, stateDir });
    expect(dumped.code).toBe(0);
    expect(dumped.stdout).toContain("dump.jsonl");
  });

  it("approve requires --request and --decision", async () => {
    const missing = await capture(["approve", "sess-1"]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("--request");
    const noDecision = await capture(["approve", "sess-1", "--request", "99"]);
    expect(noDecision.code).toBe(2);
    expect(noDecision.stderr).toContain("--decision");
  });

  it("launch --auto-approve is accepted with the fake harness", async () => {
    const launched = await capture(["launch", "--prompt", "hello", "--auto-approve", "--json"]);
    expect(launched.code, launched.stderr).toBe(0);
    expect(JSON.parse(launched.stdout).action).toBe("launch");
  });

  it("rename and archive verbs", async () => {
    const harness = new FakeHarness({ text: "x" });
    const launched = await capture(["launch", "--prompt", "task", "--json"], { harness });
    const id = (JSON.parse(launched.stdout) as { data: { agent_id: string } }).data.agent_id;
    const renamed = await capture(["rename", id, "--title", "New title", "--json"], {
      harness,
      stateDir: launched.stateDir,
    });
    expect(renamed.stdout).toContain("New title");
    const archived = await capture(["archive", id, "--json"], {
      harness,
      stateDir: launched.stateDir,
    });
    expect(archived.stdout).toContain('"isArchived": true');
  });

  it("--no-wait returns before a slow turn and close() does not serialize two launches", async () => {
    const delay = 250;
    const harness = new FakeHarness({ delayMs: delay, text: (prompt) => `done:${prompt}` });
    const stateDir = await mkdtemp(path.join(tmpdir(), "grokc-nowait-"));
    const started = Date.now();
    const first = await capture(["launch", "--prompt", "one", "--no-wait", "--json"], {
      harness,
      stateDir,
    });
    const second = await capture(["launch", "--prompt", "two", "--no-wait", "--json"], {
      harness,
      stateDir,
    });
    const parentMs = Date.now() - started;
    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(parentMs).toBeLessThan(delay);
    const idA = (JSON.parse(first.stdout) as { data: { agent_id: string } }).data.agent_id;
    const idB = (JSON.parse(second.stdout) as { data: { agent_id: string } }).data.agent_id;
    const client = createClient({ harness, stateDir });
    const [settledA, settledB] = await Promise.all([client.watch(idA), client.watch(idB)]);
    expect(settledA.status).toBe("finished");
    expect(settledB.status).toBe("finished");
    expect(settledA.lastTurn?.text).toBe("done:one");
    expect(settledB.lastTurn?.text).toBe("done:two");
    await client.close();
  });
});
