import { TriggerError } from "./errors.js";
import type { StatusSnapshot } from "./types.js";

export async function postTriggerEvent(
  baseUrl: string,
  event: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/v1/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  if (response.status >= 400) {
    const text = await response.text();
    throw new TriggerError(text || `trigger service ${response.status}`, "unavailable");
  }
}

export async function fetchStatus(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StatusSnapshot | null> {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/v1/status`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as StatusSnapshot;
  } catch {
    return null;
  }
}
