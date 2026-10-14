import { defineCommand } from "citty";
import { runWatch, seedFromStatus, watchOnce } from "../attach.js";
import { fetchStatus, postTriggerEvent } from "../client.js";
import { formatDoctor, resolveService, runDoctor } from "../doctor.js";
import { TriggerError } from "../errors.js";
import { createHerdrRunner } from "../herdr.js";
import { defaultServiceUrl } from "../paths.js";
import { readStatus, startTriggerServer } from "../server.js";
import { loadWebhookConfig } from "../config.js";
import { parseStartArgv, runAgentStart, spawnDetached } from "../start.js";
import { TriggerStore } from "../store.js";
import type { AgentKind, StatusSnapshot } from "../types.js";
import { CLI_BIN_NAME, DEFAULT_PORT, PACKAGE_VERSION } from "../version.js";
import { emit, getIo } from "./io.js";

const json = {
  type: "boolean",
  description: "Print one JSON object",
} as const;

function formatStatus(status: StatusSnapshot): string {
  const lines = [
    `service ${status.service.up ? "up" : "down"}${status.service.url ? ` ${status.service.url}` : ""}`,
    `db ${status.db}`,
    `log ${status.log}`,
    `webhook ${status.webhook.configured ? `configured ${status.webhook.source}` : "missing"}`,
    `pending ${status.counts.pending} sent ${status.counts.sent} failed ${status.counts.failed}`,
  ];
  if (status.agents.length === 0) lines.push("no agents");
  for (const agent of status.agents) {
    lines.push(`${agent.agent} ${agent.kind ?? "unknown"} ${agent.lastStatus ?? "unknown"}`);
  }
  if (status.lastDelivery) {
    const outcome = status.lastDelivery.ok ? "sent" : "error";
    lines.push(
      `last ${outcome} ${status.lastDelivery.agent} ${status.lastDelivery.status} attempt ${status.lastDelivery.attempt}`,
    );
  }
  return lines.join("\n");
}

async function statusSnapshot(): Promise<StatusSnapshot> {
  const io = getIo();
  const store = new TriggerStore(io.location.dbPath);
  try {
    const service = await resolveService(io.location, io.env);
    return readStatus(store, io.location.logPath, loadWebhookConfig(io.env, io.location), service);
  } finally {
    store.close();
  }
}

const serve = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} trigger serve`,
    description: "Accept agent events and POST done/blocked once to the Grok Bot webhook",
  },
  args: {
    port: { type: "string", description: "Listen port", default: String(DEFAULT_PORT) },
    host: { type: "string", description: "Loopback host", default: "127.0.0.1" },
    "no-watch": { type: "boolean", description: "Do not auto-attach codex and claude agents" },
    json,
  },
  async run({ args }) {
    const io = getIo();
    const port = Number(args.port);
    const store = new TriggerStore(io.location.dbPath);
    try {
      const running = await startTriggerServer({
        store,
        port,
        hostname: args.host,
        logPath: io.location.logPath,
        location: io.location,
        env: io.env,
        watch: args["no-watch"] !== true,
      });
      emit(args.json === true, { url: running.url, db: store.path, log: io.location.logPath }, `${running.url}\ndb ${store.path}`);
      await waitForStop();
      await running.close();
    } finally {
      store.close();
    }
  },
});

const attach = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} trigger attach`,
    description: "Watch one herdr agent and forward status changes to the local trigger",
  },
  args: {
    agent: { type: "positional", description: "herdr agent name", required: true },
    kind: { type: "string", description: "codex or claude, if herdr does not report it" },
    interval: { type: "string", description: "Poll interval in milliseconds", default: "5000" },
    lines: { type: "string", description: "Lines of recent output to include", default: "60" },
    cwd: { type: "string", description: "Fallback cwd" },
    worktree: { type: "string", description: "Fallback worktree path" },
    "service-url": { type: "string", description: "Local trigger base URL" },
    background: { type: "boolean", description: "Detach the watcher" },
    once: { type: "boolean", description: "Poll once and exit" },
    json,
  },
  async run({ args }) {
    const kind = parseKind(args.kind);
    const intervalMs = parsePositive(args.interval, "interval");
    const lines = parsePositive(args.lines, "lines");
    if (args.background === true) {
      const childArgs = ["trigger", "attach", args.agent, "--interval", String(intervalMs), "--lines", String(lines)];
      if (kind) childArgs.push("--kind", kind);
      if (args.cwd) childArgs.push("--cwd", args.cwd);
      if (args.worktree) childArgs.push("--worktree", args.worktree);
      if (args["service-url"]) childArgs.push("--service-url", args["service-url"]);
      if (args.json === true) childArgs.push("--json");
      const pid = spawnDetached(childArgs, getIo().env);
      emit(args.json === true, { agent: args.agent, pid, attached: true }, `attached ${args.agent} pid ${pid}`);
      return;
    }
    const io = getIo();
    const serviceUrl = (args["service-url"] ?? defaultServiceUrl(io.env)).replace(/\/$/, "");
    const runner = createHerdrRunner(io.env.HERDR_BIN, io.env);
    const remote = await fetchStatus(serviceUrl);
    let memory = remote ? seedFromStatus(remote, args.agent) : { lastStatus: null };
    const post = async (event: Record<string, unknown>) => {
      await postTriggerEvent(serviceUrl, event);
      if (args.json === true) io.stdout(JSON.stringify(event));
      else io.stdout(`sent ${args.agent} ${String(event.status)}`);
    };
    if (args.once === true) {
      const tick = await watchOnce({
        agent: args.agent,
        kind,
        runner,
        post,
        memory,
        lines,
        cwd: args.cwd,
        worktree: args.worktree,
      });
      if (!tick.posted && args.json === true) {
        io.stdout(JSON.stringify({ agent: args.agent, posted: false, status: tick.snapshot?.status ?? null }));
      }
      return;
    }
    const abort = new AbortController();
    const stop = () => abort.abort();
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    try {
      await runWatch({
        agent: args.agent,
        kind,
        runner,
        post,
        memory,
        intervalMs,
        lines,
        cwd: args.cwd,
        worktree: args.worktree,
        signal: abort.signal,
      });
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    }
  },
});

const status = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} trigger status`,
    description: "Show the queue, webhook configuration, and attached agents",
  },
  args: { json },
  async run({ args }) {
    const snapshot = await statusSnapshot();
    emit(args.json === true, snapshot, formatStatus(snapshot));
  },
});

const doctor = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} trigger doctor`,
    description: "Check node, the local database, webhook secrets, and herdr",
  },
  args: { json },
  async run({ args }) {
    const io = getIo();
    const report = await runDoctor(io.env, io.location);
    emit(args.json === true, report, formatDoctor(report));
    if (!report.ok) throw new TriggerError("trigger doctor found a required check failing", "unavailable");
  },
});

const start = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} trigger start`,
    description: "Start a codex or claude herdr agent in yolo mode and attach a trigger",
  },
  args: {
    agent: { type: "positional", description: "herdr agent name", required: true },
    kind: { type: "string", description: "codex or claude", required: true },
    pane: { type: "string", description: "Existing shell pane id", required: true },
    cwd: { type: "string", description: "Fallback cwd recorded on events" },
    worktree: { type: "string", description: "Fallback worktree recorded on events" },
    timeout: { type: "string", description: "herdr start timeout in milliseconds" },
    "no-yolo": { type: "boolean", description: "Do not pass the dangerously-skip approval flags" },
    "no-attach": { type: "boolean", description: "Do not watch the agent after start" },
    "no-serve": { type: "boolean", description: "Do not start the local trigger service" },
    json,
  },
  run() {
    throw new TriggerError("internal: trigger start should be parsed before citty", "invalid");
  },
});

export const trigger = defineCommand({
  meta: {
    name: `${CLI_BIN_NAME} trigger`,
    description: "Forward herdr done/blocked events to the Grok Bot webhook",
  },
  subCommands: {
    serve,
    attach,
    status,
    doctor,
    start,
  },
});

export const main = defineCommand({
  meta: {
    name: CLI_BIN_NAME,
    version: PACKAGE_VERSION,
    description: "Local trigger for herdr agents",
  },
  subCommands: {
    trigger,
  },
});

export async function runStartCli(argv: string[]): Promise<void> {
  const args = parseStartArgv(argv);
  const io = getIo();
  const result = await runAgentStart({ args, env: io.env });
  emit(
    args.json,
    {
      agent: args.agent,
      kind: args.kind,
      herdrArgs: result.herdrArgs,
      started: result.started,
      attached: result.attached,
      service: result.service,
    },
    `started ${args.agent} ${args.kind}${result.attached ? " attached" : ""}`,
  );
}

function parseKind(value: string | undefined): AgentKind | undefined {
  if (value === undefined || value === "") return undefined;
  if (value === "codex" || value === "claude") return value;
  throw new TriggerError("kind must be codex or claude", "invalid");
}

function parsePositive(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new TriggerError(`${name} must be a positive integer`, "invalid");
  return parsed;
}

function waitForStop(): Promise<void> {
  return new Promise((resolve) => {
    const stop = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
