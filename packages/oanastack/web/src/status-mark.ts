/** Badge shown in the diff tree and file heading. Added is +, deleted is -, modified stays M. */
export function statusMark(status: string): string {
  const letter = status.slice(0, 1).toUpperCase();
  if (letter === "A") return "+";
  if (letter === "D") return "-";
  return letter || "?";
}
