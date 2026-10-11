import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { StoreError } from "./errors.js";
import type { Store } from "./store.js";
import type { ResultStatus } from "./types.js";

export function resolveWebRoot(moduleUrl: string = import.meta.url): string | null {
  const dir = path.dirname(fileURLToPath(moduleUrl));
  const candidates = [path.join(dir, "web"), path.join(dir, "../dist/web")];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "index.html"))) return candidate;
  }
  return null;
}

export function createApp(store: Store, options?: { webRoot?: string | null }): Hono {
  const app = new Hono();
  const webRoot = options?.webRoot ?? null;

  app.onError((err, c) => {
    if (err instanceof StoreError) {
      const status = err.code === "not_found" ? 404 : err.code === "conflict" ? 409 : 400;
      return c.json({ error: err.message }, status);
    }
    const message = err instanceof Error ? err.message : "internal error";
    return c.json({ error: message }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/overview", (c) => c.json(store.overview()));
  app.get("/api/projects", (c) => c.json(store.listProjects()));
  app.post("/api/projects", async (c) => {
    const body = await readJson(c);
    const project = store.addProject({
      slug: requireString(body, "slug"),
      name: optionalString(body, "name"),
      note: optionalString(body, "note"),
    });
    return c.json(project, 201);
  });
  app.get("/api/projects/:slug", (c) => c.json(store.getProject(c.req.param("slug"))));
  app.post("/api/projects/:slug/targets", async (c) => {
    const body = await readJson(c);
    const target = store.addTarget({
      project: c.req.param("slug"),
      title: requireString(body, "title"),
      worktreePath: optionalString(body, "worktreePath"),
      branch: optionalString(body, "branch"),
    });
    return c.json(target, 201);
  });
  app.get("/api/targets/:id", (c) => c.json(store.getTarget(idParam(c.req.param("id")))));
  app.post("/api/targets/:id/result", async (c) => {
    const body = await readJson(c);
    const target = store.setResult(idParam(c.req.param("id")), {
      status: requireString(body, "status") as ResultStatus,
      summary: optionalString(body, "summary"),
      worktreePath: optionalString(body, "worktreePath"),
      branch: optionalString(body, "branch"),
      herdrStatus: optionalString(body, "herdrStatus"),
      herdrResult: optionalString(body, "herdrResult"),
    });
    return c.json(target);
  });
  app.post("/api/targets/:id/completions", async (c) => {
    const body = await readJson(c);
    const completion = store.addCompletion(idParam(c.req.param("id")), {
      changed: requireString(body, "changed"),
      why: requireString(body, "why"),
      verified: requireString(body, "verified"),
      risks: optionalString(body, "risks"),
      review: optionalString(body, "review") ?? optionalString(body, "check"),
    });
    return c.json(completion, 201);
  });

  if (webRoot) {
    app.use("/*", serveStatic({ root: webRoot }));
  }

  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) return c.json({ error: "not found" }, 404);
    if (!webRoot) {
      return c.text("dashboard assets are missing. From packages/oanastack run: npm run build\n", 503);
    }
    return c.text("not found\n", 404);
  });

  return app;
}

async function readJson(c: { req: { text: () => Promise<string> } }): Promise<Record<string, unknown>> {
  const raw = await c.req.text();
  if (!raw.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new StoreError("invalid JSON body", "invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StoreError("JSON body must be an object", "invalid");
  }
  return value as Record<string, unknown>;
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") throw new StoreError(`${key} must be a string`, "invalid");
  return value;
}

function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  if (!(key in body) || body[key] === undefined || body[key] === null) return undefined;
  const value = body[key];
  if (typeof value !== "string") throw new StoreError(`${key} must be a string`, "invalid");
  return value;
}

function idParam(raw: string): number {
  if (!/^[1-9]\d*$/.test(raw)) throw new StoreError("id must be a positive integer", "invalid");
  return Number(raw);
}
