#!/usr/bin/env node
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const shebang = "#!/usr/bin/env node\n";
const bins = ["dist/cli.js", "dist/worker.js"];

for (const rel of bins) {
  const file = path.join(root, rel);
  if (!existsSync(file)) continue;
  const current = readFileSync(file, "utf8");
  if (!current.startsWith("#!")) {
    writeFileSync(file, shebang + current);
  }
  chmodSync(file, 0o755);
}
