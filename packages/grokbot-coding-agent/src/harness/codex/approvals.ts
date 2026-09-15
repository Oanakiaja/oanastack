import type { ApprovalDecision, AutoApprovalDecision } from "../../types.js";
import type { JsonlServerRequest } from "./jsonl.js";

export const APPROVAL_METHODS = [
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
] as const;

export function isApprovalMethod(method: string): boolean {
  return (APPROVAL_METHODS as readonly string[]).includes(method) || method.endsWith("/requestApproval");
}

export function approvalKind(method: string): string {
  if (method.includes("commandExecution")) {
    return "commandExecution";
  }
  if (method.includes("fileChange")) {
    return "fileChange";
  }
  if (method.includes("permissions")) {
    return "permissions";
  }
  return method;
}

export function wireApprovalDecision(decision: ApprovalDecision): AutoApprovalDecision {
  return decision === "cancel" ? "decline" : decision;
}

export function approvalResult(method: string, decision: ApprovalDecision, params: unknown): unknown {
  if (method.includes("permissions")) {
    const record = params && typeof params === "object" ? (params as Record<string, unknown>) : {};
    return {
      permissions: record.permissions ?? record.requestedPermissions ?? {},
      scope: "session",
    };
  }
  return { decision: wireApprovalDecision(decision) };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function approvalSummary(kind: string, params: unknown): string {
  const record = asRecord(params) ?? {};
  if (typeof record.command === "string" && record.command.trim()) {
    return record.command;
  }
  if (typeof record.commandLine === "string" && record.commandLine.trim()) {
    return record.commandLine;
  }
  if (typeof record.path === "string" && record.path.trim()) {
    return record.path;
  }
  if (Array.isArray(record.paths)) {
    const paths = record.paths.filter((entry): entry is string => typeof entry === "string");
    if (paths.length > 0) {
      return paths.join(", ");
    }
  }
  return kind;
}

export function describeApproval(request: JsonlServerRequest): {
  kind: string;
  summary: string;
  threadId?: string;
  turnId?: string;
  payload: unknown;
} {
  const params = asRecord(request.params) ?? {};
  const turn = asRecord(params.turn);
  const kind = approvalKind(request.method);
  return {
    kind,
    summary: approvalSummary(kind, request.params),
    threadId: typeof params.threadId === "string" ? params.threadId : undefined,
    turnId:
      typeof params.turnId === "string"
        ? params.turnId
        : typeof turn?.id === "string"
          ? turn.id
          : undefined,
    payload: request.params,
  };
}
