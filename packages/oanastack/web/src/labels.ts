export function featureLabel(status: string): string {
  switch (status) {
    case "open":
      return "进行中";
    case "review":
      return "等 review";
    case "done":
      return "已完成";
    case "abandoned":
      return "已放弃";
    default:
      return status;
  }
}

export function targetLabel(status: string): string {
  switch (status) {
    case "open":
      return "进行中";
    case "success":
      return "成功";
    case "failed":
      return "失败";
    case "rejected":
      return "不做";
    default:
      return status;
  }
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}
