import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createClient } from "../src/client.js";
import { CodexHarness } from "../src/harness/codex/harness.js";
import { DEFAULT_CODEX_OPT_OUT_NOTIFICATIONS } from "../src/harness/codex/options.js";
import { encodeJsonl } from "../src/harness/codex/jsonl.js";
import { createScriptedCodexSpawn } from "./helpers/scripted-codex.js";

describe("Codex JSONL harness", () => {
  it("handshakes without a jsonrpc field and uses kebab-case sandbox", async () => {
    const { spawn, sent } = createScriptedCodexSpawn();
    const stateDir = await mkdtemp(path.join(tmpdir(), "grokc-codex-"));
    const harness = new CodexHarness({ spawn, autoApproval: "acceptForSession" });
    const client = createClient({ harness, stateDir, cwd: stateDir });
    const launched = await client.launch({
      prompt: "say coach-ok",
      cwd: stateDir,
      sandbox: "workspace-write",
      approvalPolicy: "never",
    });
    const settled = await client.watch(launched.agent_id);
    await client.close();

    expect(settled.lastTurn?.text).toBe("coach-ok");
    expect(sent.some((message) => "jsonrpc" in message)).toBe(false);
    const initialize = sent.find((message) => message.method === "initialize");
    expect(initialize).toMatchObject({
      method: "initialize",
      params: {
        clientInfo: { name: "grokbot_coding_agent" },
        capabilities: {
          optOutNotificationMethods: [...DEFAULT_CODEX_OPT_OUT_NOTIFICATIONS],
        },
      },
    });
    expect(sent.some((message) => message.method === "initialized")).toBe(true);
    const start = sent.find((message) => message.method === "thread/start");
    expect(start?.params).toMatchObject({
      cwd: stateDir,
      sandbox: "workspace-write",
      approvalPolicy: "never",
    });
    expect(sent.some((message) => message.method === "turn/start")).toBe(true);
  });

  it("keeps approvals pending until client.approve", async () => {
    const approvals: string[] = [];
    const { spawn, sent } = createScriptedCodexSpawn({
      onRequest: (request, send) => {
        if (request.method === "turn/start") {
          send({ id: request.id, result: { turn: { id: "turn_1", status: "inProgress", items: [] } } });
          send({
            id: 99,
            method: "item/commandExecution/requestApproval",
            params: { threadId: "thr_scripted", turnId: "turn_1", itemId: "cmd_1", command: "ls" },
          });
          return true;
        }
        if (request.id === 99 && request.result) {
          send({
            method: "turn/completed",
            params: {
              threadId: "thr_scripted",
              turn: {
                id: "turn_1",
                status: "completed",
                items: [{ id: "item_1", type: "agentMessage", text: "approved" }],
              },
            },
          });
          return true;
        }
        return false;
      },
    });
    const stateDir = await mkdtemp(path.join(tmpdir(), "grokc-approve-"));
    const harness = new CodexHarness({ spawn, autoApproval: false });
    const client = createClient({ harness, stateDir });
    client.on((event) => {
      if (event.type === "approval.needed") {
        approvals.push(event.type);
      }
    });
    const launched = await client.launch({ prompt: "run ls", cwd: stateDir });
    let pending = await client.get(launched.agent_id);
    for (let i = 0; i < 40 && !pending.waitingOnApproval; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      pending = await client.get(launched.agent_id);
    }
    expect(pending.waitingOnApproval).toBe(true);
    expect(pending.pendingApprovals?.[0]).toMatchObject({
      id: "99",
      kind: "commandExecution",
      summary: "ls",
    });
    expect(
      sent.some((message) => message.id === 99 && message.result),
    ).toBe(false);

    const decided = await client.approve({
      agent_id: launched.agent_id,
      requestId: "99",
      decision: "accept",
    });
    expect(decided.decision).toBe("accept");
    expect(decided.waitingOnApproval).toBe(false);

    const settled = await client.watch(launched.agent_id);
    await client.close();
    expect(settled.lastTurn?.text).toBe("approved");
    expect(settled.waitingOnApproval).toBe(false);
    expect(approvals).toContain("approval.needed");
    expect(
      sent.some(
        (message) =>
          message.id === 99 &&
          message.result &&
          (message.result as { decision?: string }).decision === "accept",
      ),
    ).toBe(true);
  });

  it("auto-answers approval requests when autoApproval is opted in", async () => {
    const approvals: string[] = [];
    const { spawn, sent } = createScriptedCodexSpawn({
      onRequest: (request, send) => {
        if (request.method === "turn/start") {
          send({ id: request.id, result: { turn: { id: "turn_1", status: "inProgress", items: [] } } });
          send({
            id: 99,
            method: "item/commandExecution/requestApproval",
            params: { threadId: "thr_scripted", turnId: "turn_1", itemId: "cmd_1", command: "ls" },
          });
          send({
            method: "turn/completed",
            params: {
              threadId: "thr_scripted",
              turn: {
                id: "turn_1",
                status: "completed",
                items: [{ id: "item_1", type: "agentMessage", text: "approved" }],
              },
            },
          });
          return true;
        }
        return false;
      },
    });
    const stateDir = await mkdtemp(path.join(tmpdir(), "grokc-auto-approve-"));
    const harness = new CodexHarness({ spawn, autoApproval: "acceptForSession" });
    const client = createClient({ harness, stateDir, autoApprove: true });
    client.on((event) => {
      if (event.type === "approval.needed") {
        approvals.push(event.type);
      }
    });
    const launched = await client.launch({ prompt: "run ls", cwd: stateDir });
    const settled = await client.watch(launched.agent_id);
    await client.close();
    expect(settled.lastTurn?.text).toBe("approved");
    expect(settled.waitingOnApproval).toBeFalsy();
    expect(approvals).toContain("approval.needed");
    expect(
      sent.some(
        (message) =>
          message.id === 99 &&
          message.result &&
          (message.result as { decision?: string }).decision === "acceptForSession",
      ),
    ).toBe(true);
  });

  it("never encodes jsonrpc on the wire", () => {
    const line = encodeJsonl({ method: "initialize", id: 1, params: {}, jsonrpc: "2.0" });
    expect(line).not.toContain("jsonrpc");
  });
});
