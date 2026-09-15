import { describe, expect, it } from "vitest";
import { HarnessNotImplementedError, UnknownHarnessError } from "../src/errors.js";
import { getHarness } from "../src/harness/registry.js";

describe("stub harnesses", () => {
  it.each(["cursor-cli", "claude-code", "kimi"] as const)(
    "%s throws HarnessNotImplementedError",
    async (id) => {
      const harness = getHarness(id);
      expect(harness.id).toBe(id);
      await expect(harness.connect()).rejects.toBeInstanceOf(HarnessNotImplementedError);
      await expect(harness.startSession({ cwd: process.cwd() })).rejects.toMatchObject({
        name: "HarnessNotImplementedError",
        harness: id,
      });
      await expect(harness.resumeSession("abc")).rejects.toBeInstanceOf(HarnessNotImplementedError);
      await expect(harness.listSessions()).rejects.toBeInstanceOf(HarnessNotImplementedError);
    },
  );

  it("rejects unknown harness ids", () => {
    expect(() => getHarness("not-a-harness")).toThrow(UnknownHarnessError);
  });
});
