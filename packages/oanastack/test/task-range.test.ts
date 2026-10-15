import { describe, expect, it } from "vitest";
import { taskRanges, type TaskRangeInput } from "../src/task-range.js";

function target(partial: Partial<TaskRangeInput> & Pick<TaskRangeInput, "id">): TaskRangeInput {
  return {
    status: "success",
    createdAt: `2026-01-0${partial.id}T00:00:00.000Z`,
    startSha: null,
    endSha: null,
    ...partial,
  };
}

describe("taskRanges", () => {
  it("selects base for the first target and the previous end for the next", () => {
    const ranges = taskRanges(
      [
        target({ id: 2, createdAt: "2026-01-02T00:00:00.000Z", endSha: "bbbbbbb" }),
        target({ id: 1, createdAt: "2026-01-01T00:00:00.000Z", startSha: "aaaaaaa", endSha: "bbbbbbb" }),
      ],
      "main",
    );
    expect(ranges.map((range) => range.id)).toEqual([1, 2]);
    expect(ranges[0]).toMatchObject({ kind: "base", fromRef: "aaaaaaa", toRef: "bbbbbbb", ready: true, live: false, message: null });
    expect(ranges[1]).toMatchObject({ kind: "previous", fromRef: "bbbbbbb", toRef: "bbbbbbb", ready: true, live: false });
  });

  it("falls back to the base branch when the first target has no start sha", () => {
    const ranges = taskRanges([target({ id: 1, endSha: "abc1234", startSha: null })], "master");
    expect(ranges[0]).toMatchObject({ kind: "base", fromRef: "master", toRef: "abc1234", ready: true });
  });

  it("keeps an unfinished target empty unless it is the open tip", () => {
    const ranges = taskRanges(
      [
        target({ id: 1, status: "open", endSha: null, startSha: "abc1234" }),
        target({ id: 2, status: "open", endSha: null }),
        target({ id: 3, status: "success", endSha: null, createdAt: "2026-01-03T00:00:00.000Z" }),
      ],
      "main",
    );
    expect(ranges[0]).toMatchObject({ ready: false, live: false, message: "进行中，完成后才有任务 diff" });
    expect(ranges[1]).toMatchObject({ ready: false, live: false, fromRef: null, message: "上一任务还没有 end commit。" });
    expect(ranges[2]).toMatchObject({ ready: false, live: false, message: "上一任务还没有 end commit。" });

    const tip = taskRanges(
      [
        target({ id: 1, endSha: "bbbbbbb" }),
        target({ id: 2, status: "open", endSha: null }),
      ],
      "main",
    );
    expect(tip[1]).toMatchObject({ kind: "previous", fromRef: "bbbbbbb", toRef: "HEAD", ready: true, live: true, message: null });
  });

  it("breaks the chain when the previous target has no end sha", () => {
    const ranges = taskRanges(
      [
        target({ id: 1, status: "success", endSha: null }),
        target({ id: 2, endSha: "ccccccc" }),
      ],
      "main",
    );
    expect(ranges[1]).toMatchObject({ ready: false, fromRef: null, toRef: "ccccccc", message: "上一任务还没有 end commit。" });
  });
});
