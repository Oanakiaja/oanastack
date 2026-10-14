import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { authorizationHeader, loadWebhookConfig, parseEnvFile } from "../src/config.js";
import { TriggerError } from "../src/errors.js";
import { firstLine, normalizeEvent } from "../src/normalize.js";
import { parseAgentGet, parseAgentList } from "../src/herdr.js";
import { planWatches, watchOnce } from "../src/attach.js";
import { herdrStartArgs, yoloFlag } from "../src/yolo.js";
import { parseStartArgv } from "../src/start.js";
import type { HerdrSnapshot } from "../src/types.js";
import { tempHome } from "./helpers.js";

describe("normalize", () => {
  it("accepts a herdr done event and fills summary from text", () => {
    const event = normalizeEvent(
      {
        agent: "cx1",
        kind: "codex",
        status: "DONE",
        text: "\u001B[32mshipped\u001B[0m the trigger\nsecond",
        cwd: "/work",
        worktree: "/work/wt",
        ts: "2026-10-14T16:18:00Z",
      },
      new Date("2026-10-14T00:00:00Z"),
    );
    expect(event).toMatchObject({
      agent: "cx1",
      kind: "codex",
      status: "done",
      summary: "shipped the trigger",
      cwd: "/work",
      worktree: "/work/wt",
      ts: "2026-10-14T16:18:00.000Z",
    });
  });

  it("rejects unknown kinds and agents", () => {
    expect(() => normalizeEvent({ agent: "Bad", kind: "codex", status: "done" })).toThrow(TriggerError);
    expect(() => normalizeEvent({ agent: "cx1", kind: "cursor", status: "done" })).toThrow(/kind/);
    expect(() => normalizeEvent({ agent: "w9:p1", kind: "claude", status: "blocked" })).not.toThrow();
  });

  it("keeps an explicit summary", () => {
    expect(firstLine("  \nsecond")).toBe("second");
    expect(normalizeEvent({ agent: "cx1", kind: "claude", status: "blocked", summary: "need approval", text: "long" }).summary).toBe(
      "need approval",
    );
  });
});

describe("webhook auth", () => {
  it("normalizes bearer and Authorization prefixes", () => {
    expect(authorizationHeader("secret")).toBe("Bearer secret");
    expect(authorizationHeader("Bearer secret")).toBe("Bearer secret");
    expect(authorizationHeader("bearer secret")).toBe("Bearer secret");
    expect(authorizationHeader("Authorization: Bearer secret")).toBe("Bearer secret");
    expect(authorizationHeader("Authorization: secret")).toBe("Bearer secret");
  });

  it("reads ~/.oanastack then ~/.config/herdr, and env wins", () => {
    const { env, location } = tempHome();
    mkdirSync(path.dirname(location.herdrEnv), { recursive: true });
    writeFileSync(location.herdrEnv, "GROKBOT_WEBHOOK=https://herdr.example/hook\nGROKBOT_AUTH=from-herdr\n");
    expect(loadWebhookConfig(env, location)).toMatchObject({
      url: "https://herdr.example/hook",
      authorization: "Bearer from-herdr",
      source: location.herdrEnv,
    });

    mkdirSync(location.root, { recursive: true });
    writeFileSync(location.localEnv, "GROKBOT_WEBHOOK=https://local.example/hook\nGROKBOT_AUTH='from-local'\n");
    expect(loadWebhookConfig(env, location)?.url).toBe("https://local.example/hook");
    expect(loadWebhookConfig(env, location)?.authorization).toBe("Bearer from-local");

    const withEnv = { ...env, GROKBOT_AUTH: "from-env" };
    expect(loadWebhookConfig(withEnv, location)).toMatchObject({
      url: "https://local.example/hook",
      authorization: "Bearer from-env",
    });
    expect(parseEnvFile("export GROKBOT_WEBHOOK=\"https://x\"\n# c\n\n")).toEqual({
      GROKBOT_WEBHOOK: "https://x",
    });
  });
});

describe("herdr parsing and yolo start", () => {
  it("parses agent get and list payloads", () => {
    const snap = parseAgentGet(
      JSON.stringify({
        result: {
          agent: {
            name: "cx1",
            agent: "codex",
            agent_status: "blocked",
            foreground_cwd: "/repo",
            worktree: { path: "/repo/wt" },
            pane_id: "w1:p1",
          },
        },
      }),
    );
    expect(snap).toMatchObject({
      name: "cx1",
      kind: "codex",
      status: "blocked",
      cwd: "/repo",
      worktree: "/repo/wt",
      paneId: "w1:p1",
    });
    const list = parseAgentList(
      JSON.stringify({ result: { agents: [{ name: "cl1", kind: "claude", agent_status: "working" }, { name: "other" }] } }),
    );
    expect(list.map((item) => item.kind)).toEqual(["claude", null]);
  });

  it("plans watches for codex and claude only", () => {
    const live: HerdrSnapshot[] = [
      { name: "cx1", kind: "codex", status: "working", cwd: null, worktree: null, paneId: null, revision: null },
      { name: "cl1", kind: "claude", status: "idle", cwd: null, worktree: null, paneId: null, revision: null },
      { name: "pi1", kind: null, status: "working", cwd: null, worktree: null, paneId: null, revision: null },
    ];
    const plan = planWatches(live, new Set(["cx1"]));
    expect(plan.start.map((item) => item.name)).toEqual(["cl1"]);
    expect(plan.stop).toEqual([]);
    expect(planWatches(live.slice(0, 1), new Set(["cx1", "cl1"])).stop).toEqual(["cl1"]);
  });

  it("puts dangerously yolo flags after herdr --", () => {
    expect(yoloFlag("codex")).toBe("--dangerously-bypass-approvals-and-sandbox");
    expect(yoloFlag("claude")).toBe("--dangerously-skip-permissions");
    expect(
      herdrStartArgs({
        agent: "cx1",
        kind: "codex",
        pane: "w1:p1",
        extra: ["-m", "gpt-5.5"],
        yolo: true,
      }),
    ).toEqual([
      "agent",
      "start",
      "cx1",
      "--kind",
      "codex",
      "--pane",
      "w1:p1",
      "--",
      "--dangerously-bypass-approvals-and-sandbox",
      "-m",
      "gpt-5.5",
    ]);
    expect(
      herdrStartArgs({
        agent: "cl1",
        kind: "claude",
        pane: "w1:p2",
        extra: ["--dangerously-skip-permissions"],
        yolo: true,
      }).filter((arg) => arg === "--dangerously-skip-permissions"),
    ).toHaveLength(1);
    const parsed = parseStartArgv(["cx1", "--kind", "claude", "--pane", "w2:p1", "--", "--model", "opus"]);
    expect(parsed).toMatchObject({ agent: "cx1", kind: "claude", pane: "w2:p1", yolo: true, extra: ["--model", "opus"] });
  });
});

describe("watchOnce", () => {
  it("posts on status changes and stays quiet while the status holds", async () => {
    const statuses = ["working", "working", "done", "done", "working", "blocked"];
    const posts: Array<Record<string, unknown>> = [];
    const runner = {
      async get() {
        const status = statuses.shift() ?? "blocked";
        return {
          name: "cx1",
          kind: "codex" as const,
          status: status as "working",
          cwd: "/work",
          worktree: "/work/wt",
          paneId: "w1:p1",
          revision: 1,
        };
      },
      async read() {
        return "finished the task\n";
      },
    };
    let memory = { lastStatus: null as "working" | "done" | "blocked" | null };
    for (let i = 0; i < 6; i += 1) {
      const tick = await watchOnce({
        agent: "cx1",
        runner,
        post: async (event) => {
          posts.push(event);
        },
        memory,
      });
      memory = tick.memory;
    }
    expect(posts.map((event) => event.status)).toEqual(["working", "done", "working", "blocked"]);
    expect(posts[1]).toMatchObject({ summary: "finished the task", text: "finished the task\n", cwd: "/work", worktree: "/work/wt" });
    expect(posts[0]?.text).toBeNull();
  });
});
