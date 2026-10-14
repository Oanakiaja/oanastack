import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli/run.js";
import { startTriggerServer } from "../src/server.js";
import { TriggerStore } from "../src/store.js";
import { fakeWebhook, tempHome } from "./helpers.js";

function fakeHerdr(home: string, logFile: string): string {
  const file = path.join(home, "herdr");
  writeFileSync(
    file,
    `#!/bin/sh
if [ "$1" = "agent" ] && [ "$2" = "get" ]; then
  printf '%s\\n' '{"result":{"agent":{"name":"cx1","agent":"codex","agent_status":"done","cwd":"/work","worktree":"/work/wt"}}}'
  exit 0
fi
if [ "$1" = "agent" ] && [ "$2" = "read" ]; then
  printf '%s\\n' 'shipped the trigger'
  exit 0
fi
if [ "$1" = "agent" ] && [ "$2" = "start" ]; then
  printf '%s\\n' "$*" >> "$HERDR_LOG"
  printf '%s\\n' '{"ok":true}'
  exit 0
fi
exit 1
`,
  );
  chmodSync(file, 0o755);
  writeFileSync(logFile, "");
  return file;
}

async function capture(argv: string[], env: NodeJS.ProcessEnv) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(argv, {
    env,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

describe("cli", () => {
  it("prints help and version", async () => {
    const { env } = tempHome();
    const help = await capture(["--help"], env);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("trigger");
    const triggerHelp = await capture(["trigger", "--help"], env);
    expect(triggerHelp.stdout).toContain("serve");
    expect(triggerHelp.stdout).toContain("attach");
    expect(triggerHelp.stdout).toContain("status");
    expect(triggerHelp.stdout).toContain("doctor");
    const version = await capture(["--version"], env);
    expect(version.stdout).toContain("@oana/oanastack-trigger 0.1.0");
    const incomplete = await capture(["trigger"], env);
    expect(incomplete.code).toBe(2);
  });

  it("doctor hides webhook secrets and status reports an empty queue", async () => {
    const { env } = tempHome();
    const secret = "super-secret-token";
    env.GROKBOT_WEBHOOK = "https://example.test/hook";
    env.GROKBOT_AUTH = secret;
    const doctor = await capture(["trigger", "doctor", "--json"], env);
    expect(doctor.code).toBe(0);
    expect(doctor.stdout).toContain('"ok":true');
    expect(doctor.stdout).not.toContain(secret);
    expect(doctor.stdout).not.toContain("https://example.test/hook");
    const status = await capture(["trigger", "status"], env);
    expect(status.code).toBe(0);
    expect(status.stdout).toContain("webhook configured env");
    expect(status.stdout).toContain("no agents");
    expect(status.stdout).not.toContain(secret);
  });

  it("doctor fails when the webhook is missing", async () => {
    const { env } = tempHome();
    const doctor = await capture(["trigger", "doctor"], env);
    expect(doctor.code).toBe(1);
    expect(doctor.stdout).toContain("fail webhook");
  });

  it("attach --once forwards a done agent to the fake webhook", async () => {
    const { home, env, location } = tempHome();
    const hook = await fakeWebhook();
    env.GROKBOT_WEBHOOK = hook.url;
    env.GROKBOT_AUTH = "super-secret-token";
    const store = new TriggerStore(location.dbPath);
    const running = await startTriggerServer({
      store,
      port: 0,
      logPath: location.logPath,
      location,
      env,
      watch: false,
    });
    try {
      env.HERDR_BIN = fakeHerdr(home, path.join(home, "herdr.log"));
      const attached = await capture(
        ["trigger", "attach", "cx1", "--kind", "codex", "--once", "--service-url", running.url],
        env,
      );
      expect(attached.code).toBe(0);
      expect(attached.stdout).toContain("sent cx1 done");
      expect(hook.hits).toHaveLength(1);
      expect(hook.hits[0]?.authorization).toBe("Bearer super-secret-token");
      expect(hook.hits[0]?.body).toMatchObject({
        agent: "cx1",
        kind: "codex",
        status: "done",
        summary: "shipped the trigger",
        cwd: "/work",
        worktree: "/work/wt",
      });
    } finally {
      await running.close();
      store.close();
      await hook.close();
    }
  });

  it("start launches herdr in yolo mode", async () => {
    const { home, env } = tempHome();
    const logFile = path.join(home, "herdr.log");
    env.HERDR_BIN = fakeHerdr(home, logFile);
    env.HERDR_LOG = logFile;
    const started = await capture(
      ["trigger", "start", "cx1", "--kind", "codex", "--pane", "w1:p1", "--no-serve", "--no-attach", "--", "-m", "gpt-5.5"],
      env,
    );
    expect(started.code).toBe(0);
    expect(started.stdout).toContain("started cx1 codex");
    const log = readFileSync(logFile, "utf8");
    expect(log).toContain("agent start cx1 --kind codex --pane w1:p1 -- --dangerously-bypass-approvals-and-sandbox -m gpt-5.5");
  });

  it("reads webhook secrets from a herdr env file", async () => {
    const { env, location } = tempHome();
    mkdirSync(path.dirname(location.herdrEnv), { recursive: true });
    writeFileSync(location.herdrEnv, "GROKBOT_WEBHOOK=https://example.test/hook\nGROKBOT_AUTH=file-secret\n");
    const doctor = await capture(["trigger", "doctor", "--json"], env);
    expect(doctor.code).toBe(0);
    expect(doctor.stdout).not.toContain("file-secret");
    expect(doctor.stdout).toContain("grokbot-webhook.env");
  });
});
