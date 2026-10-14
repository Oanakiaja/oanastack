import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export interface DeliveryLogLine {
  ts: string;
  eventId: number;
  agent: string;
  status: string;
  attempt: number;
  ok: boolean;
  httpStatus: number;
  error: string | null;
}

export function appendDeliveryLog(logPath: string, line: DeliveryLogLine): void {
  mkdirSync(path.dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(line)}\n`);
}

export function sanitizeError(error: string, webhookUrl: string): string {
  if (!webhookUrl) return error;
  return error.split(webhookUrl).join("webhook");
}
