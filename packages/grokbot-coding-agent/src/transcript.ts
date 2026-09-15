import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionStore } from "./state.js";

export interface TranscriptMessage {
  role: "user" | "assistant" | "tool" | "event";
  text?: string;
  ts: string;
  name?: string;
  type?: string;
  status?: string;
  raw?: unknown;
}

export async function appendTranscript(
  store: SessionStore,
  sessionId: string,
  message: Omit<TranscriptMessage, "ts"> & { ts?: string },
): Promise<void> {
  const file = store.transcriptPath(sessionId);
  await mkdir(path.dirname(file), { recursive: true });
  const line = JSON.stringify({ ts: message.ts ?? new Date().toISOString(), ...message });
  await appendFile(file, `${line}\n`, "utf8");
}

export async function readTranscript(store: SessionStore, sessionId: string): Promise<TranscriptMessage[]> {
  try {
    const raw = await readFile(store.transcriptPath(sessionId), "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TranscriptMessage);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function writeTranscriptCopy(
  store: SessionStore,
  sessionId: string,
  destination: string,
): Promise<{ path: string; lineCount: number; sizeBytes: number }> {
  const messages = await readTranscript(store, sessionId);
  await mkdir(path.dirname(destination), { recursive: true });
  const body = messages.map((message) => JSON.stringify(message)).join("\n");
  const text = body.length > 0 ? `${body}\n` : "";
  await writeFile(destination, text, "utf8");
  const info = await stat(destination);
  return { path: destination, lineCount: messages.length, sizeBytes: info.size };
}
