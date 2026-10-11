import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { StoreError } from "./errors.js";

export interface Location {
  root: string;
  dbPath: string;
  configPath: string;
}

/** `OANASTACK_HOME`, else `OANASTACK_DB` (root is its directory), else the config file, else `~/.oanastack`. */
export function resolveLocation(env: NodeJS.ProcessEnv = process.env): Location {
  const configPath = resolveConfigPath(env);
  const homeOverride = env.OANASTACK_HOME?.trim();
  if (homeOverride) {
    const root = expandHome(homeOverride, env);
    return { root, dbPath: path.join(root, "oanastack.sqlite"), configPath };
  }
  const dbOverride = env.OANASTACK_DB?.trim();
  if (dbOverride) {
    const dbPath = path.resolve(expandHome(dbOverride, env));
    return { root: path.dirname(dbPath), dbPath, configPath };
  }
  const configured = readConfiguredRoot(configPath);
  const root = configured ?? path.join(homeDir(env), ".oanastack");
  return { root, dbPath: path.join(root, "oanastack.sqlite"), configPath };
}

export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveLocation(env).dbPath;
}

export function resolveConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OANASTACK_CONFIG?.trim();
  if (explicit) return path.resolve(expandHome(explicit, env));
  return path.join(homeDir(env), ".config", "oanastack", "oanastack.json");
}

export function expandHome(input: string, env: NodeJS.ProcessEnv = process.env): string {
  const home = homeDir(env);
  if (input === "~") return home;
  if (input.startsWith("~/")) return path.join(home, input.slice(2));
  return input;
}

export function readConfiguredRoot(configPath: string): string | null {
  if (!existsSync(configPath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  } catch {
    throw new StoreError(`invalid config file: ${configPath}`, "invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !("root" in parsed)) {
    throw new StoreError(`config file needs a string root: ${configPath}`, "invalid");
  }
  const root = (parsed as { root: unknown }).root;
  if (typeof root !== "string" || !root.trim()) {
    throw new StoreError(`config file needs a string root: ${configPath}`, "invalid");
  }
  const trimmed = root.trim();
  if (!path.isAbsolute(trimmed)) throw new StoreError("configured root must be absolute", "invalid");
  return trimmed;
}

/** Writes the root pointer. Does not move an existing database. */
export function writeConfiguredRoot(env: NodeJS.ProcessEnv, rawPath: string): Location {
  const expanded = expandHome(rawPath.trim(), env);
  if (!path.isAbsolute(expanded)) throw new StoreError("root must be an absolute path", "invalid");
  mkdirSync(expanded, { recursive: true });
  const root = realpathOrSame(expanded);
  const configPath = resolveConfigPath(env);
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify({ root }, null, 2)}\n`);
  return { root, dbPath: path.join(root, "oanastack.sqlite"), configPath };
}

export function featureWorkspace(root: string, project: string, feature: string): string {
  return path.join(root, "projects", project, "features", feature);
}

export function featureWorktree(root: string, project: string, feature: string, repo: string): string {
  return path.join(featureWorkspace(root, project, feature), repo);
}

export function featureArchive(root: string, project: string, feature: string): string {
  return path.join(root, "projects", project, "archive", feature);
}

function homeDir(env: NodeJS.ProcessEnv): string {
  return env.HOME?.trim() || homedir();
}

function realpathOrSame(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return dir;
  }
}
