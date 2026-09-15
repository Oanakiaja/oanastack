import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
  name?: string;
  private?: boolean;
  main?: string;
  types?: string;
  files?: string[];
  bin?: Record<string, string>;
  scripts?: Record<string, string>;
  repository?: { url?: string; directory?: string };
  bugs?: { url?: string };
  homepage?: string;
  publishConfig?: { access?: string };
  license?: string;
  version?: string;
  exports?: { "."?: { types?: string; import?: string } };
};

describe("npm publish shape", () => {
  it("is public with dist entrypoints and GitHub metadata", () => {
    expect(pkg.private).toBeUndefined();
    expect(pkg.name).toBe("@oana/grokbot-coding-agent");
    expect(pkg.version).toBe("0.2.0");
    expect(pkg.license).toBe("UNLICENSED");
    expect(pkg.main).toBe("./dist/index.js");
    expect(pkg.types).toBe("./dist/index.d.ts");
    expect(pkg.exports?.["."]?.types).toBe("./dist/index.d.ts");
    expect(pkg.exports?.["."]?.import).toBe("./dist/index.js");
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "README.md"]));
    expect(pkg.bin?.grokc).toBe("dist/cli.js");
    expect(pkg.bin?.["grokbot-coding-agent"]).toBe("dist/cli.js");
    expect(pkg.bin?.gcac).toBeUndefined();
    expect(pkg.bin?.["grokbot-coding-agent-cli"]).toBeUndefined();
    expect(pkg.scripts?.prepare).toMatch(/build/);
    expect(pkg.scripts?.prepublishOnly).toMatch(/test/);
    expect(pkg.publishConfig?.access).toBe("public");
    expect(pkg.repository?.url).toContain("github.com/Oanakiaja/oanastack");
    expect(pkg.repository?.directory).toBe("packages/grokbot-coding-agent");
    expect(pkg.bugs?.url).toContain("github.com/Oanakiaja/oanastack");
    expect(pkg.homepage).toContain("github.com/Oanakiaja/oanastack");
  });
});
