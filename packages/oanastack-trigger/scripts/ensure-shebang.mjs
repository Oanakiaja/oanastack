#!/usr/bin/env node
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const shebang = "#!/usr/bin/env node\n";
const file = path.join(root, "dist/cli.js");

if (!existsSync(file)) process.exit(0);
const current = readFileSync(file, "utf8");
if (!current.startsWith("#!")) {
  writeFileSync(file, shebang + current);
}
chmodSync(file, 0o755);
