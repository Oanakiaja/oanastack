import { existsSync, readFileSync } from "node:fs";
import { TriggerError } from "./errors.js";
import { resolveTriggerLocation, type TriggerLocation } from "./paths.js";

export interface WebhookConfig {
  url: string;
  authorization: string;
  source: string;
}

export function loadWebhookConfig(
  env: NodeJS.ProcessEnv = process.env,
  location: TriggerLocation = resolveTriggerLocation(env),
): WebhookConfig | null {
  const fromEnv = {
    url: env.GROKBOT_WEBHOOK?.trim() ?? "",
    auth: env.GROKBOT_AUTH?.trim() ?? "",
  };
  const file = readWebhookFiles(location);
  const url = fromEnv.url || file.url;
  const auth = fromEnv.auth || file.auth;
  if (!url || !auth) return null;
  const source = sourceLabel(fromEnv, file);
  return { url, authorization: authorizationHeader(auth), source };
}

export function authorizationHeader(raw: string): string {
  let value = raw.trim();
  if (/^authorization\s*:/i.test(value)) {
    value = value.replace(/^authorization\s*:\s*/i, "");
  }
  if (/^bearer\s+/i.test(value)) {
    value = value.replace(/^bearer\s+/i, "").trim();
  }
  if (!value) throw new TriggerError("GROKBOT_AUTH is empty", "invalid");
  return `Bearer ${value}`;
}

export function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function readWebhookFiles(location: TriggerLocation): { url: string; auth: string; source: string | null } {
  let url = "";
  let auth = "";
  let source: string | null = null;
  for (const file of [location.localEnv, location.herdrEnv]) {
    if (!existsSync(file)) continue;
    let parsed: Record<string, string>;
    try {
      parsed = parseEnvFile(readFileSync(file, "utf8"));
    } catch {
      throw new TriggerError(`cannot read webhook env: ${file}`, "invalid");
    }
    if (!url && parsed.GROKBOT_WEBHOOK?.trim()) {
      url = parsed.GROKBOT_WEBHOOK.trim();
      source ??= file;
    }
    if (!auth && parsed.GROKBOT_AUTH?.trim()) {
      auth = parsed.GROKBOT_AUTH.trim();
      source ??= file;
    }
    if (url && auth) break;
  }
  return { url, auth, source };
}

function sourceLabel(
  fromEnv: { url: string; auth: string },
  file: { source: string | null },
): string {
  const envUsed = Boolean(fromEnv.url || fromEnv.auth);
  if (envUsed && file.source && (!fromEnv.url || !fromEnv.auth)) return `env+${file.source}`;
  if (envUsed) return "env";
  return file.source ?? "env";
}
