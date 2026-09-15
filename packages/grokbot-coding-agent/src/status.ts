import type { AgentStatus, TurnStatus } from "./types.js";

export function turnStatusToAgentStatus(status: TurnStatus | string | undefined): AgentStatus {
  switch (status) {
    case "inProgress":
    case "running":
    case "creating":
      return status === "creating" ? "creating" : "running";
    case "interrupted":
    case "cancelled":
      return "cancelled";
    case "failed":
    case "error":
      return "error";
    case "completed":
    case "finished":
      return "finished";
    default:
      return "finished";
  }
}

export function isActiveStatus(status: AgentStatus | undefined): boolean {
  return status === "creating" || status === "running";
}

export function isTerminalStatus(status: AgentStatus | undefined): boolean {
  return status === "finished" || status === "error" || status === "cancelled";
}
