import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createClient } from "../src/client.js";
import { FakeHarness } from "../src/harness/fake.js";
import { UsageError } from "../src/errors.js";

async function tempClient(fake: FakeHarness = new FakeHarness()) {
  const stateDir = await mkdtemp(path.join(tmpdir(), "grokc-"));
  const client = createClient({ harness: fake, stateDir, cwd: stateDir });
  return { client, stateDir, fake };
}

describe("CloudAgent Session API (fake harness)", () => {
  const clients: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  it("launch returns immediately with id + url and does not block on the turn", async () => {
    const fake = new FakeHarness({ delayMs: 80, text: "hello-from-fake" });
    const { client } = await tempClient(fake);
    clients.push(client);
    const started = Date.now();
    const launched = await client.launch({ prompt: "hi", cwd: process.cwd() });
    expect(Date.now() - started).toBeLessThan(50);
    expect(launched.agent_id).toBeTruthy();
    expect(launched.sessionId).toBe(launched.agent_id);
    expect(launched.url).toBe(`grokc://${launched.agent_id}`);
    const during = await client.get(launched.agent_id);
    expect(["creating", "running"]).toContain(during.status);
    const settled = await client.watch(launched.agent_id);
    expect(settled.status).toBe("finished");
    expect(settled.lastTurn?.text).toBe("hello-from-fake");
  });

  it("supports client.run({ action }) for the CloudAgent verbs", async () => {
    const { client } = await tempClient();
    clients.push(client);
    const launched = await client.run({ action: "launch", prompt: "first", cwd: process.cwd() });
    expect(launched.action).toBe("launch");
    if (launched.action !== "launch") {
      throw new Error("expected launch");
    }
    await client.watch(launched.data.agent_id);
    const listed = await client.run({ action: "list", scope: "launched" });
    expect(listed.action).toBe("list");
    if (listed.action !== "list") {
      throw new Error("expected list");
    }
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]?.agent_id).toBe(launched.data.agent_id);
  });

  it("reply continues the same session and can queue or interrupt", async () => {
    const fake = new FakeHarness({ delayMs: 60, text: (prompt) => `done:${prompt}` });
    const { client } = await tempClient(fake);
    clients.push(client);
    const launched = await client.launch({ prompt: "one", cwd: process.cwd() });
    const queued = await client.reply({
      agent_id: launched.agent_id,
      prompt: "two",
    });
    expect(queued.queued).toBe(true);
    expect(queued.wasRunning).toBe(true);
    expect(queued.agent_id).toBe(launched.agent_id);

    const fake2 = new FakeHarness({ delayMs: 80, text: (prompt) => `done:${prompt}` });
    const second = await tempClient(fake2);
    clients.push(second.client);
    const other = await second.client.launch({ prompt: "start", cwd: process.cwd() });
    const interrupted = await second.client.reply({
      agent_id: other.agent_id,
      prompt: "override",
      interrupt: true,
    });
    expect(interrupted.interrupted).toBe(true);
    expect(fake2.interrupts.length).toBeGreaterThan(0);
    const settled = await second.client.watch(other.agent_id);
    expect(settled.lastTurn?.text).toBe("done:override");
  });

  it("get / list / rename / archive / unarchive / dump / cancel", async () => {
    const fake = new FakeHarness({ delayMs: 40, text: "report" });
    const { client, stateDir } = await tempClient(fake);
    clients.push(client);
    const launched = await client.launch({ prompt: "work", cwd: "/tmp/project", title: "Original" });
    const got = await client.get({ agent_id: launched.agent_id });
    expect(got.cwd).toBe("/tmp/project");
    expect(got.name).toBe("Original");
    expect(got.branchName).toBe("/tmp/project");

    const renamed = await client.rename({ agent_id: launched.agent_id, title: "Renamed" });
    expect(renamed.name).toBe("Renamed");

    await client.watch(launched.agent_id);
    const dumpPath = path.join(stateDir, "out.jsonl");
    const dumped = await client.dump({ agent_id: launched.agent_id, path: dumpPath });
    expect(dumped.lineCount).toBeGreaterThan(0);
    const text = await readFile(dumpPath, "utf8");
    expect(text).toContain("work");
    expect(text).toContain("report");

    const archived = await client.archive(launched.agent_id);
    expect(archived.isArchived).toBe(true);
    const hidden = await client.list({ scope: "launched" });
    expect(hidden).toHaveLength(0);
    const shown = await client.list({ scope: "launched", include_archived: true });
    expect(shown).toHaveLength(1);
    const restored = await client.unarchive(launched.agent_id);
    expect(restored.isArchived).toBe(false);

    const slow = new FakeHarness({ delayMs: 100, text: "late" });
    const other = await tempClient(slow);
    clients.push(other.client);
    const running = await other.client.launch({ prompt: "slow", cwd: process.cwd() });
    const cancelled = await other.client.cancel(running.agent_id);
    expect(cancelled.status).toBe("cancelled");
  });

  it("requires prompt for launch and agent_id for get", async () => {
    const { client } = await tempClient();
    clients.push(client);
    await expect(client.launch({ cwd: process.cwd() })).rejects.toBeInstanceOf(UsageError);
    await expect(client.get({})).rejects.toBeInstanceOf(UsageError);
  });
});
