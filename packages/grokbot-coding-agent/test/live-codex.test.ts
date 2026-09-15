import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createClient } from "../src/client.js";

const live = process.env.GROKBOT_CODING_AGENT_CLI_LIVE === "1";
const hasCodex = spawnSync("codex", ["--version"], { encoding: "utf8" }).status === 0;

describe.skipIf(!live || !hasCodex)("live Codex app-server", () => {
  it("launches a session and completes a turn with coach-ok", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "grokc-live-"));
    const client = createClient({
      harness: "codex",
      stateDir,
      cwd: stateDir,
      codex: { autoApproval: "acceptForSession" },
    });
    try {
      const launched = await client.launch({
        prompt: "Reply with exactly: coach-ok",
        cwd: stateDir,
        sandbox: "read-only",
        approvalPolicy: "never",
      });
      expect(launched.agent_id).toBeTruthy();
      const settled = await client.watch(launched.agent_id);
      expect(settled.status === "finished" || settled.status === "error").toBe(true);
      if (settled.status === "finished") {
        expect(settled.lastTurn?.text ?? "").toMatch(/coach-ok/i);
      }
    } finally {
      await client.close();
    }
  }, 180_000);
});
