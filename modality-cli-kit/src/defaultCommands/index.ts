/**
 * Default commands — the ones {@link createCliRunner} registers on a CLI's
 * behalf, so every kit-based CLI gets them without declaring anything.
 *
 * Adding one is a change to this folder alone: drop the module into
 * `commands/` beside `merge.ts` — one command per file, one export each, as
 * `commands/__tests__/exports.test.ts` enforces — and add its factory to
 * {@link DEFAULT_COMMANDS}. This file is the only place they are wired
 * together, which is why it sits outside `commands/`. The runner reads
 * the map, the `DefaultCommandName` union widens automatically, and the
 * `withoutDefaultCommand` option accepts the new name with no further wiring.
 *
 * Each factory receives the consuming CLI's name and its own registry, so a
 * default command can tailor its help to the CLI it lands in.
 */
import type { CLICommand } from "../help/types";
import type { CommandRegistry } from "../registry";
import { createMergeCommand } from "./commands/merge";

/** Builds a default command for the CLI it is being registered into. */
type DefaultCommandFactory = (cliName: string, registry: CommandRegistry) => CLICommand;

/** Every default command, keyed by the name it registers under. */
const DEFAULT_COMMANDS = {
  merge: (cliName, registry) =>
    createMergeCommand({ cliName, exampleCommands: exampleCommandNames(registry) }),
} satisfies Record<string, DefaultCommandFactory>;

/** Name of a command the runner supplies by default. */
export type DefaultCommandName = keyof typeof DEFAULT_COMMANDS;

/**
 * Two of the CLI's own command names, so a default command's examples are
 * copy-pasteable instead of placeholders. Falls back to generic names when the
 * registry is too small to supply a pair.
 */
function exampleCommandNames(registry: CommandRegistry): [string, string] {
  const [first = "alpha", second = "beta"] = registry.all.map((cmd) => cmd.name!);
  return [first, second];
}

/**
 * Resolve which default commands to append: those not switched off, and not
 * already defined by the CLI itself — a command the registry owns under the
 * same name always wins, so shadowing needs no opt-out.
 *
 * @param disabled `true` to register none, or the names to leave out.
 */
export function defaultCommandsFor(
  cliName: string,
  registry: CommandRegistry,
  disabled: boolean | DefaultCommandName[] | undefined,
): CLICommand[] {
  if (disabled === true) return [];
  const off = new Set<string>(Array.isArray(disabled) ? disabled : []);

  return Object.entries(DEFAULT_COMMANDS)
    .filter(([name]) => !off.has(name) && !registry.get(name))
    .map(([, build]) => build(cliName, registry));
}

export { createMergeCommand } from "./commands/merge";
export type { MergeCommandOptions } from "./commands/merge";
