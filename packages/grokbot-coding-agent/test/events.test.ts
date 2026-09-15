import { describe, expect, it } from "vitest";
import { applyNotification, emptyTurnSnapshot } from "../src/harness/codex/normalize.js";
import { extractAgentText, normalizeItem } from "../src/events.js";

describe("event normalization", () => {
  it("normalizes Codex item and turn notifications", () => {
    const sessionId = "sess_1";
    let snapshot = emptyTurnSnapshot();

    const started = applyNotification(sessionId, snapshot, {
      method: "turn/started",
      params: { threadId: "thr_1", turn: { id: "turn_1" } },
    });
    expect(started.event).toMatchObject({ type: "turn.started", sessionId, turnId: "turn_1" });
    snapshot = started.snapshot;

    const item = applyNotification(sessionId, snapshot, {
      method: "item/completed",
      params: { item: { id: "i1", type: "agentMessage", text: "coach-ok" } },
    });
    expect(item.event?.type).toBe("item.completed");
    if (item.event?.type === "item.completed") {
      expect(item.event.item.text).toBe("coach-ok");
    }
    snapshot = item.snapshot;

    const completed = applyNotification(sessionId, snapshot, {
      method: "turn/completed",
      params: {
        turn: {
          id: "turn_1",
          status: "completed",
          items: [{ id: "i1", type: "agentMessage", text: "coach-ok" }],
        },
      },
    });
    expect(completed.event).toMatchObject({
      type: "turn.completed",
      status: "completed",
      text: "coach-ok",
    });
  });

  it("extracts agent text from mixed item shapes", () => {
    expect(
      extractAgentText([
        { type: "userMessage", text: "ignore" },
        { type: "agentMessage", content: [{ text: "hello " }, { text: "world" }] },
      ]),
    ).toBe("hello world");
    expect(normalizeItem({ id: "x", type: "fileChange", status: "completed" })).toMatchObject({
      id: "x",
      type: "fileChange",
      status: "completed",
    });
  });
});
