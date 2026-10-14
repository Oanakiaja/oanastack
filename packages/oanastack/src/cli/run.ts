import path from "node:path";
import { renderUsage, runCommand, type CommandDef } from "citty";
import { exitCodeFor, StoreError } from "../errors.js";
import { resolveLocation } from "../paths.js";
import { CLI_BIN_NAME, PACKAGE_NAME, PACKAGE_VERSION } from "../version.js";
import { main } from "./commands.js";
import { plain, setIo, type CliIo } from "./io.js";

export interface RunCliOptions {
  dbPath?: string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
}

export async function runCli(argv: string[], options: RunCliOptions = {}): Promise<number> {
  const env = options.env ?? process.env;
  const location = resolveLocation(env);
  const dbPath = options.dbPath ? path.resolve(options.dbPath) : location.dbPath;
  const io: CliIo = {
    dbPath,
    root: options.dbPath ? path.dirname(dbPath) : location.root,
    env,
    stdout: options.stdout ?? ((line) => console.log(line)),
    stderr: options.stderr ?? ((line) => console.error(line)),
  };
  setIo(io);
  const json = argv.includes("--json");
  try {
    assertNodeVersion();
    if (argv.length === 1 && (argv[0] === "--version" || argv[0] === "-v")) {
      io.stdout(`${PACKAGE_NAME} ${PACKAGE_VERSION}`);
      return 0;
    }
    const target = findCommand(main, argv);
    const help = argv.length === 0 || argv.some((arg) => arg === "--help" || arg === "-h");
    if (help || target.missingSubcommand) {
      io.stdout(await renderUsage(target.cmd));
      return help ? 0 : 2;
    }
    await runCommand(main, { rawArgs: argv });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? plain(error.message) : "unknown error";
    if (json) io.stderr(JSON.stringify({ error: message }));
    else io.stderr(`${CLI_BIN_NAME}: ${message}`);
    if (error instanceof StoreError) return exitCodeFor(error);
    if (error instanceof Error && error.name === "CLIError") return 2;
    return 1;
  }
}

function assertNodeVersion(): void {
  const [major = 0, minor = 0] = process.versions.node.split(".").map((part) => Number(part));
  if (major < 22 || (major === 22 && minor < 13)) {
    throw new Error(`Node.js >= 22.13 is required for node:sqlite. Current: ${process.versions.node}`);
  }
}

interface Found {
  cmd: CommandDef;
  missingSubcommand: boolean;
}

function findCommand(cmd: CommandDef, argv: string[]): Found {
  const table = subcommandTable(cmd);
  if (!table) return { cmd, missingSubcommand: false };
  const token = argv.find((arg) => arg !== "--" && !arg.startsWith("-"));
  if (!token) {
    return { cmd, missingSubcommand: typeof cmd.run !== "function" };
  }
  const next = resolveSub(table, token);
  if (!next) return { cmd, missingSubcommand: false };
  return findCommand(next, argv.slice(argv.indexOf(token) + 1));
}

function subcommandTable(cmd: CommandDef): Record<string, CommandDef> | undefined {
  const subCommands = cmd.subCommands;
  if (!subCommands || typeof subCommands === "function") return undefined;
  return subCommands as Record<string, CommandDef>;
}

function resolveSub(table: Record<string, CommandDef>, name: string): CommandDef | undefined {
  const direct = table[name];
  if (direct && typeof direct !== "function") return direct;
  for (const sub of Object.values(table)) {
    if (!sub || typeof sub === "function") continue;
    if (aliasesOf(sub).includes(name)) return sub;
  }
  return undefined;
}

function aliasesOf(cmd: CommandDef): string[] {
  const meta = cmd.meta;
  if (!meta || typeof meta !== "object" || !("alias" in meta)) return [];
  const alias = meta.alias;
  if (!alias) return [];
  return Array.isArray(alias) ? [...alias] : [alias];
}
