/** Badge shown in the diff tree and file heading. Added is +, deleted is -, modified stays M. */
export function statusMark(status: string): string {
  const letter = status.slice(0, 1).toUpperCase();
  if (letter === "A") return "+";
  if (letter === "D") return "-";
  return letter || "?";
}

/** Color tone for a status badge. M and other letters stay readable, not gray. */
export function statusTone(status: string): "add" | "del" | "mod" {
  const mark = statusMark(status);
  if (mark === "+") return "add";
  if (mark === "-") return "del";
  return "mod";
}
