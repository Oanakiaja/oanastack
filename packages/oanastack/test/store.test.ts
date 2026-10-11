import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { StoreError } from "../src/errors.js";
import { openStore, progressOf } from "../src/store.js";

function tempDb(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "oanastack-")), "oanastack.sqlite");
}

describe("store", () => {
  it("records projects, targets, results, and completions", () => {
    const dbPath = tempDb();
    const store = openStore(dbPath);
    const project = store.addProject({ slug: "billing-api", name: "Billing API", note: "charges" });
    expect(project.progress).toEqual(progressOf([]));

    const target = store.addTarget({
      project: "billing-api",
      title: "Idempotent charge keys",
      worktreePath: "/tmp/billing",
      branch: "feature/idempotency",
    });
    expect(target.status).toBe("open");

    const updated = store.setResult(target.id, {
      status: "success",
      summary: "retries no longer double-charge",
      herdrStatus: "ok",
      herdrResult: "herdr apply finished",
    });
    expect(updated.status).toBe("success");
    expect(updated.worktreePath).toBe("/tmp/billing");
    expect(updated.herdrResult).toBe("herdr apply finished");

    const completion = store.addCompletion(target.id, {
      changed: "charge keys are stored before capture",
      why: "retries were creating a second charge",
      verified: "npm test\nhttps://example.test/run/1",
      risks: "legacy clients still omit the key",
      review: "place the same order twice and expect one charge",
    });
    expect(completion.targetId).toBe(target.id);

    const overview = store.overview();
    expect(overview.dbPath).toBe(dbPath);
    expect(overview.progress).toMatchObject({ total: 1, success: 1, ratio: 1 });
    expect(overview.projects[0]?.targets[0]?.completions[0]?.review).toContain("one charge");
    store.close();

    const again = openStore(dbPath);
    expect(again.listProjects()).toHaveLength(1);
    again.close();
  });

  it("counts mixed statuses and rejects bad input", () => {
    const store = openStore(tempDb());
    store.addProject({ slug: "auth-session" });
    const ok = store.addTarget({ project: "auth-session", title: "Rotate refresh tokens" });
    const bad = store.addTarget({ project: "auth-session", title: "Webhook signature" });
    const skip = store.addTarget({ project: "auth-session", title: "Drop legacy cookie" });
    store.addTarget({ project: "auth-session", title: "Retry budget" });
    store.setResult(ok.id, { status: "success", summary: "rotated" });
    store.setResult(bad.id, { status: "failed", summary: "sig mismatch" });
    store.setResult(skip.id, { status: "rejected", summary: "out of scope" });

    expect(store.overview().progress).toEqual({
      total: 4,
      open: 1,
      success: 1,
      failed: 1,
      rejected: 1,
      ratio: 0.25,
    });

    expect(() => store.addProject({ slug: "Auth Session" })).toThrow(StoreError);
    expect(() => store.addProject({ slug: "auth-session" })).toThrow(/already exists/);
    expect(() => store.setResult(ok.id, { status: "open" as "success" })).toThrow(/status must be/);
    expect(() => store.addCompletion(ok.id, { changed: " ", why: "y", verified: "v" })).toThrow(/changed is required/);
    expect(() => store.getProject("missing")).toThrow(/not found/);
    store.close();
  });
});
