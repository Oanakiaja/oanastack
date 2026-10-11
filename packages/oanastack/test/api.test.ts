import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/api.js";
import { openStore } from "../src/store.js";
import { assertLoopback, startServer } from "../src/server.js";

function tempDb(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "oanastack-")), "oanastack.sqlite");
}

describe("api", () => {
  it("serves overview JSON and rejects unknown routes without the dashboard build", async () => {
    const store = openStore(tempDb());
    const app = createApp(store, { webRoot: null });
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "billing-api", name: "Billing API" }),
    });
    expect(created.status).toBe(201);

    const target = await app.request("/api/projects/billing-api/targets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Idempotent charge keys", branch: "feature/idempotency" }),
    });
    expect(target.status).toBe(201);
    const targetBody = (await target.json()) as { id: number };
    const result = await app.request(`/api/targets/${targetBody.id}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "success", summary: "one charge", herdrStatus: "ok" }),
    });
    expect(result.status).toBe(200);

    const done = await app.request(`/api/targets/${targetBody.id}/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        changed: "keys stored first",
        why: "retries double-charged",
        verified: "vitest",
        check: "place the order twice",
      }),
    });
    expect(done.status).toBe(201);

    const overview = await app.request("/api/overview");
    expect(overview.status).toBe(200);
    const body = (await overview.json()) as {
      progress: { success: number };
      projects: Array<{ targets: Array<{ completions: Array<{ review: string | null }> }> }>;
    };
    expect(body.progress.success).toBe(1);
    expect(body.projects[0]?.targets[0]?.completions[0]?.review).toBe("place the order twice");

    const missing = await app.request("/api/nope");
    expect(missing.status).toBe(404);
    const page = await app.request("/");
    expect(page.status).toBe(503);
    store.close();
  });

  it("lists a directory for the repo picker", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "oanastack-browse-"));
    mkdirSync(path.join(root, "billing"));
    mkdirSync(path.join(root, ".git"));
    const store = openStore(tempDb());
    const app = createApp(store, { webRoot: null });
    const listed = await app.request(`/api/browse?path=${encodeURIComponent(root)}`);
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { path: string; entries: Array<{ name: string }>; parent: string | null };
    expect(body.path).toBe(root);
    expect(body.entries.map((entry) => entry.name)).toEqual(["billing"]);
    expect(body.parent).toBeTruthy();
    const relative = await app.request("/api/browse?path=relative");
    expect(relative.status).toBe(400);
    store.close();
  });

  it("listens on localhost and refuses other hosts", async () => {
    expect(() => assertLoopback("0.0.0.0")).toThrow(/localhost/);
    const store = openStore(tempDb());
    const running = await startServer({ store, port: 0, hostname: "127.0.0.1", webRoot: null });
    try {
      const response = await fetch(`${running.url}/api/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    } finally {
      await running.close();
      store.close();
    }
  });
});
