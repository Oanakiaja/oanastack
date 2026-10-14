import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deliverDue, deliverEvent } from "../src/deliver.js";
import { startTriggerServer } from "../src/server.js";
import { TriggerStore } from "../src/store.js";
import { fakeWebhook, tempHome } from "./helpers.js";

const secret = "super-secret-token";

describe("trigger delivery", () => {
  it("POSTs once with Authorization Bearer and dedupes a held status", async () => {
    const { env, location } = tempHome();
    const hook = await fakeWebhook();
    env.GROKBOT_WEBHOOK = hook.url;
    env.GROKBOT_AUTH = `Authorization: Bearer ${secret}`;
    const store = new TriggerStore(location.dbPath);
    const running = await startTriggerServer({
      store,
      port: 0,
      hostname: "127.0.0.1",
      logPath: location.logPath,
      location,
      env,
      watch: false,
    });
    try {
      const done = {
        agent: "cx1",
        kind: "codex",
        status: "done",
        text: "shipped the trigger",
        cwd: "/work",
        worktree: "/work/wt",
        branch: "feature/trigger",
        ts: "2026-10-14T16:18:00.000Z",
      };
      const first = await fetch(`${running.url}/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(done),
      });
      expect(first.status).toBe(200);
      const again = await fetch(`${running.url}/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(done),
      });
      expect(again.status).toBe(200);
      expect(await again.json()).toMatchObject({ duplicate: true });

      await fetch(`${running.url}/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...done, status: "working", text: null, summary: null }),
      });
      const next = await fetch(`${running.url}/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...done, status: "blocked", text: "approve git push" }),
      });
      expect(next.status).toBe(200);

      expect(hook.hits).toHaveLength(2);
      expect(hook.hits[0]?.authorization).toBe(`Bearer ${secret}`);
      expect(hook.hits[0]?.body).toMatchObject({
        agent: "cx1",
        kind: "codex",
        status: "done",
        summary: "shipped the trigger",
        text: "shipped the trigger",
        cwd: "/work",
        worktree: "/work/wt",
        branch: "feature/trigger",
        ts: "2026-10-14T16:18:00.000Z",
      });
      expect(hook.hits[0]?.body).toHaveProperty("branch");
      expect(hook.hits[0]?.body).toHaveProperty("cwd");
      expect(hook.hits[0]?.body).toHaveProperty("worktree");
      expect(hook.hits[1]?.body).toMatchObject({ status: "blocked", summary: "approve git push" });
      expect(JSON.stringify(hook.hits)).not.toContain("GROKBOT");
    } finally {
      await running.close();
      store.close();
      await hook.close();
    }
  });

  it("retries a failed webhook and writes the failure to the local log", async () => {
    const { env, location } = tempHome();
    const hook = await fakeWebhook(1);
    env.GROKBOT_WEBHOOK = hook.url;
    env.GROKBOT_AUTH = secret;
    const store = new TriggerStore(location.dbPath);
    try {
      const ingest = store.ingest({
        agent: "cl1",
        kind: "claude",
        status: "done",
        summary: "done",
        text: "done",
        cwd: null,
        worktree: null,
        branch: null,
        ts: "2026-10-14T16:18:00.000Z",
      });
      expect(ingest.id).not.toBeNull();
      const options = {
        logPath: location.logPath,
        webhook: { url: hook.url, authorization: `Bearer ${secret}`, source: "env" },
        maxAttempts: 3,
        backoffMs: () => 0,
      };
      const pending = await deliverEvent(store, ingest.id ?? 0, options);
      expect(pending).toBe("pending");
      const sent = await deliverDue(store, options);
      expect(sent).toBe(1);
      expect(hook.hits).toHaveLength(2);
      expect(hook.hits[0]?.authorization).toBe(`Bearer ${secret}`);
      const log = readFileSync(location.logPath, "utf8");
      expect(log).toContain('"ok":false');
      expect(log).toContain('"ok":true');
      expect(log).not.toContain(secret);
      expect(log).not.toContain(hook.url);
    } finally {
      store.close();
      await hook.close();
    }
  });

  it("refuses a non-loopback host", async () => {
    const { location } = tempHome();
    const store = new TriggerStore(location.dbPath);
    await expect(
      Promise.resolve().then(() =>
        startTriggerServer({
          store,
          port: 0,
          hostname: "0.0.0.0",
          logPath: location.logPath,
          location,
          watch: false,
        }),
      ),
    ).rejects.toThrow(/loopback/);
    store.close();
  });
});
