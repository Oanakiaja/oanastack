import { homedir } from "node:os";
import path from "node:path";

export interface TriggerLocation {
  home: string;
  root: string;
  dbPath: string;
  logPath: string;
  runtimeDir: string;
  serverFile: string;
  localEnv: string;
  herdrEnv: string;
}

/** `OANASTACK_HOME`, else `~/.oanastack`. Webhook files also live under `~/.config/herdr/`. */
export function resolveTriggerLocation(env: NodeJS.ProcessEnv = process.env): TriggerLocation {
  const home = homeDir(env);
  const root = path.resolve(expandHome(env.OANASTACK_HOME?.trim() || path.join(home, ".oanastack"), env));
  const dbPath = env.OANASTACK_TRIGGER_DB?.trim()
    ? path.resolve(expandHome(env.OANASTACK_TRIGGER_DB.trim(), env))
    : path.join(root, "trigger.sqlite");
  const dir = path.dirname(dbPath);
  const runtimeDir = path.join(dir, "trigger");
  return {
    home,
    root,
    dbPath,
    logPath: path.join(dir, "trigger.log"),
    runtimeDir,
    serverFile: path.join(runtimeDir, "server.json"),
    localEnv: path.join(root, "grokbot-webhook.env"),
    herdrEnv: path.join(home, ".config", "herdr", "grokbot-webhook.env"),
  };
}

export function expandHome(input: string, env: NodeJS.ProcessEnv = process.env): string {
  const home = homeDir(env);
  if (input === "~") return home;
  if (input.startsWith("~/")) return path.join(home, input.slice(2));
  return input;
}

export function homeDir(env: NodeJS.ProcessEnv): string {
  return env.HOME?.trim() || homedir();
}

export function triggerPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.OANASTACK_TRIGGER_PORT?.trim();
  if (!raw) return 4748;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("OANASTACK_TRIGGER_PORT must be an integer from 0 to 65535");
  }
  return port;
}

export function defaultServiceUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OANASTACK_TRIGGER_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return `http://127.0.0.1:${triggerPort(env)}`;
}
