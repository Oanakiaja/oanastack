import type { TriggerLocation } from "../paths.js";

export interface CliIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  env: NodeJS.ProcessEnv;
  location: TriggerLocation;
}

let current: CliIo | undefined;

export function setIo(io: CliIo): void {
  current = io;
}

export function getIo(): CliIo {
  if (!current) throw new Error("CLI io is not set");
  return current;
}

export function emit(json: boolean, data: unknown, line: string): void {
  getIo().stdout(json ? JSON.stringify(data) : line);
}

export function plain(message: string): string {
  return message.replace(/\u001B\[[0-9;]*m/g, "");
}
