import type { WebhookConfig } from "./config.js";
import { appendDeliveryLog, sanitizeError } from "./log.js";
import type { TriggerStore } from "./store.js";
import type { DeliveryState, StoredEvent } from "./types.js";
import { postWebhook } from "./webhook.js";

export interface DeliverOptions {
  maxAttempts?: number;
  backoffMs?: (attempt: number) => number;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  logPath: string;
  webhook: WebhookConfig | null;
}

const locks = new WeakMap<TriggerStore, Promise<void>>();

export function deliverEvent(store: TriggerStore, id: number, options: DeliverOptions): Promise<DeliveryState> {
  const previous = locks.get(store) ?? Promise.resolve();
  const run = previous.then(() => deliverOne(store, id, options));
  locks.set(
    store,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

export async function deliverDue(store: TriggerStore, options: DeliverOptions): Promise<number> {
  const now = (options.now ?? (() => new Date()))().toISOString();
  const due = store.listDue(now);
  let delivered = 0;
  for (const event of due) {
    const state = await deliverEvent(store, event.id, options);
    if (state === "sent") delivered += 1;
  }
  return delivered;
}

async function deliverOne(store: TriggerStore, id: number, options: DeliverOptions): Promise<DeliveryState> {
  const event = store.getEvent(id);
  if (!event) return "failed";
  if (event.state === "sent" || event.state === "failed" || event.state === "skipped") return event.state;
  const now = options.now ?? (() => new Date());
  const at = now();
  const attempt = event.attempts + 1;
  const maxAttempts = options.maxAttempts ?? 5;
  if (!options.webhook) {
    const delay = options.backoffMs ? options.backoffMs(1) : 5_000;
    const next = new Date(at.getTime() + delay).toISOString();
    const error = "webhook is not configured";
    store.defer(event.id, error, next);
    store.recordAttempt(event.id, attempt, at.toISOString(), false, 0, error);
    appendDeliveryLog(options.logPath, {
      ts: at.toISOString(),
      eventId: event.id,
      agent: event.agent,
      status: event.status,
      attempt,
      ok: false,
      httpStatus: 0,
      error,
    });
    return "pending";
  }
  const result = await postWebhook(options.webhook, event, options.fetchImpl);
  return finish(store, event, options, attempt, at, maxAttempts, result);
}

function finish(
  store: TriggerStore,
  event: StoredEvent,
  options: DeliverOptions,
  attempt: number,
  at: Date,
  maxAttempts: number,
  result: { ok: boolean; status: number; error: string | null },
): DeliveryState {
  const iso = at.toISOString();
  const error = result.error ? sanitizeError(result.error, options.webhook?.url ?? "") : null;
  let state: DeliveryState;
  if (result.ok) {
    store.markSent(event.id, iso);
    state = "sent";
  } else if (attempt >= maxAttempts) {
    store.markFailed(event.id, error ?? "delivery failed");
    state = "failed";
  } else {
    const delay = (options.backoffMs ?? defaultBackoff)(attempt);
    const next = new Date(at.getTime() + delay).toISOString();
    store.markRetry(event.id, error ?? "delivery failed", next);
    state = "pending";
  }
  store.recordAttempt(event.id, attempt, iso, result.ok, result.status, error);
  appendDeliveryLog(options.logPath, {
    ts: iso,
    eventId: event.id,
    agent: event.agent,
    status: event.status,
    attempt,
    ok: result.ok,
    httpStatus: result.status,
    error,
  });
  return state;
}

function defaultBackoff(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
}
