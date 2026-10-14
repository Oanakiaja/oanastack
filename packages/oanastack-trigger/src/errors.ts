export type TriggerErrorCode = "invalid" | "not_found" | "conflict" | "unavailable";

export class TriggerError extends Error {
  readonly code: TriggerErrorCode;

  constructor(message: string, code: TriggerErrorCode) {
    super(message);
    this.name = "TriggerError";
    this.code = code;
  }
}

export function exitCodeFor(error: TriggerError): number {
  return error.code === "invalid" ? 2 : 1;
}
