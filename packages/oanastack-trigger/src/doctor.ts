import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadWebhookConfig } from "./config.js";
import { defaultServiceUrl, resolveTriggerLocation, type TriggerLocation } from "./paths.js";
import { pidAlive, probeService, readServerFile } from "./server.js";
import { TriggerStore } from "./store.js";
import { nodeTooOld } from "./version.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  required: boolean;
  detail: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

export async function runDoctor(
  env: NodeJS.ProcessEnv = process.env,
  location: TriggerLocation = resolveTriggerLocation(env),
  fetchImpl: typeof fetch = fetch,
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const tooOld = nodeTooOld();
  checks.push({
    name: "node",
    ok: tooOld === null,
    required: true,
    detail: tooOld ?? process.versions.node,
  });

  try {
    const store = new TriggerStore(location.dbPath);
    store.close();
    checks.push({ name: "database", ok: true, required: true, detail: location.dbPath });
  } catch (error) {
    checks.push({
      name: "database",
      ok: false,
      required: true,
      detail: error instanceof Error ? error.message : "cannot open database",
    });
  }

  const webhook = safeWebhook(env, location);
  checks.push({
    name: "webhook",
    ok: webhook.configured,
    required: true,
    detail: webhook.detail,
  });
  if (webhook.configured) {
    checks.push({
      name: "webhook-https",
      ok: webhook.https,
      required: false,
      detail: webhook.https ? "https" : "webhook URL is not https",
    });
  }

  const herdr = commandExists(env.HERDR_BIN?.trim() || "herdr");
  checks.push({
    name: "herdr",
    ok: herdr,
    required: false,
    detail: herdr ? "herdr on PATH" : "herdr not found; attach and auto-watch stay idle until it is installed",
  });

  const service = await resolveService(location, env, fetchImpl);
  checks.push({
    name: "service",
    ok: service.up,
    required: false,
    detail: service.up ? `up ${service.url}` : "trigger serve is not running",
  });

  return { ok: checks.every((check) => !check.required || check.ok), checks };
}

export function formatDoctor(report: DoctorReport): string {
  return report.checks
    .map((check) => `${check.ok ? "ok" : check.required ? "fail" : "warn"} ${check.name} ${check.detail}`)
    .join("\n");
}

export async function resolveService(
  location: TriggerLocation,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<{ up: boolean; url: string | null }> {
  const recorded = readServerFile(location.serverFile);
  const candidates: string[] = [];
  if (recorded && pidAlive(recorded.pid)) candidates.push(recorded.url);
  const fallback = defaultServiceUrl(env);
  if (!candidates.includes(fallback)) candidates.push(fallback);
  for (const url of candidates) {
    if (await probeService(url, fetchImpl)) return { up: true, url };
  }
  return { up: false, url: recorded && pidAlive(recorded.pid) ? recorded.url : null };
}

function safeWebhook(
  env: NodeJS.ProcessEnv,
  location: TriggerLocation,
): { configured: boolean; https: boolean; detail: string } {
  try {
    const config = loadWebhookConfig(env, location);
    if (!config) {
      return {
        configured: false,
        https: false,
        detail: "missing GROKBOT_WEBHOOK or GROKBOT_AUTH",
      };
    }
    let https = false;
    try {
      https = new URL(config.url).protocol === "https:";
    } catch {
      return { configured: false, https: false, detail: "GROKBOT_WEBHOOK is not a URL" };
    }
    return { configured: true, https, detail: `configured ${config.source}` };
  } catch (error) {
    return {
      configured: false,
      https: false,
      detail: error instanceof Error ? error.message : "webhook config is invalid",
    };
  }
}

function commandExists(bin: string): boolean {
  if (bin.includes("/") || bin.startsWith(".")) return existsSync(bin);
  const result = spawnSync("which", [bin], { encoding: "utf8" });
  return result.status === 0;
}
