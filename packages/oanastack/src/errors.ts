export type StoreErrorCode = "invalid" | "not_found" | "conflict";

export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(message: string, code: StoreErrorCode) {
    super(message);
    this.name = "StoreError";
    this.code = code;
  }
}

export function exitCodeFor(error: StoreError): number {
  return error.code === "invalid" ? 2 : 1;
}
