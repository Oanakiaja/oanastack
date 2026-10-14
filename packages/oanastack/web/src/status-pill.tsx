import { featureLabel, targetLabel } from "./labels";

const FEATURE = new Set(["open", "review", "done", "abandoned"]);
const TARGET = new Set(["open", "success", "failed", "rejected"]);

export function StatusPill({ kind, status }: { kind: "feature" | "target"; status: string }) {
  const label = kind === "feature" ? featureLabel(status) : targetLabel(status);
  const known = (kind === "feature" ? FEATURE : TARGET).has(status);
  return <span className={known ? `pill ${status}` : "pill unknown"}>{label}</span>;
}
