import { homedir } from "node:os";
import path from "node:path";

export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OANASTACK_DB?.trim();
  if (explicit) return explicit;
  const home = env.OANASTACK_HOME?.trim() || path.join(homedir(), ".oanastack");
  return path.join(home, "oanastack.sqlite");
}
