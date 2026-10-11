#!/usr/bin/env node
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const shebang = "#!/usr/bin/env -S node --disable-warning=ExperimentalWarning\n";
const file = path.join(root, "dist/cli.js");

if (existsSync(file)) {
  const current = readFileSync(file, "utf8");
  const body = current.replace(/^#![^\n]*\n/, "");
  if (current !== shebang + body) {
    writeFileSync(file, shebang + body);
  }
  chmodSync(file, 0o755);
}
