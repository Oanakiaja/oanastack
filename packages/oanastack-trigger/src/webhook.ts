import { publicBody } from "./normalize.js";
import type { WebhookConfig } from "./config.js";
import type { TriggerEvent } from "./types.js";

export interface WebhookResult {
  ok: boolean;
  status: number;
  error: string | null;
}

export async function postWebhook(
  config: WebhookConfig,
  event: TriggerEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<WebhookResult> {
  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: {
        authorization: config.authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify(publicBody(event)),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: `webhook responded ${response.status}` };
    }
    return { ok: true, status: response.status, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook request failed";
    return { ok: false, status: 0, error: message };
  }
}
