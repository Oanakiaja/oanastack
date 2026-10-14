export const PACKAGE_NAME = "@oana/oanastack-trigger";
export const PACKAGE_VERSION = "0.1.0";
export const CLI_BIN_NAME = "oanastack";
export const DEFAULT_PORT = 4748;

export function nodeTooOld(): string | null {
  const [major = 0, minor = 0] = process.versions.node.split(".").map((part) => Number(part));
  if (major < 22 || (major === 22 && minor < 13)) {
    return `Node.js >= 22.13 is required for node:sqlite. Current: ${process.versions.node}`;
  }
  return null;
}
