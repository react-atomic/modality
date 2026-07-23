/**
 * Command registry — the single place a CLI wires its commands and aliases.
 *
 * Each command is a self-contained `CLICommand`; the registry resolves names
 * and aliases to the right command and dispatches to its `execute`. Command
 * modules never declare their own aliases — the alias map here is the one
 * source of truth.
 *
 * ## Quick start
 *
 * ```ts
 * import { createCommandRegistry } from "modality-cli-kit";
 * import { fooCommand } from "./commands/foo";
 * import { barCommand } from "./commands/bar";
 *
 * export const registry = createCommandRegistry(
 *   [fooCommand, barCommand],
 *   { foo: ["f"], bar: ["b", "baz"] },
 * );
 *
 * registry.get("baz")?.name;           // → "bar"
 * await registry.execute("foo", { target: "x" });
 * ```
 */
import type { CLICommand } from "./help/types";

/** A resolved command registry returned by {@link createCommandRegistry}. */
export interface CommandRegistry {
  /** All registered commands, in declaration order. */
  all: CLICommand[];
  /** Alias → canonical-command-name map (as supplied). */
  aliases: Record<string, string[]>;
  /** Resolve a command by its name or any alias. */
  get(name: string): CLICommand | undefined;
  /** Resolve and run a command; unknown names return a `success: false` envelope. */
  execute(name: string, args: unknown): Promise<unknown>;
}

/**
 * Build a {@link CommandRegistry} from a list of commands and an alias map.
 *
 * @param commands  One `CLICommand` per capability.
 * @param aliases   `commandName → [alias, ...]`. Aliases live only here, never
 *                  on the command objects themselves.
 */
export function createCommandRegistry(
  commands: CLICommand[],
  aliases: Record<string, string[]> = {},
): CommandRegistry {
  // Only named commands are resolvable; drop nameless ones up front so the
  // lookup map and the exposed `all` list agree on what "registered" means.
  const registered = commands.filter(
    (cmd): cmd is CLICommand & { name: string } => !!cmd.name,
  );

  const map = new Map<string, CLICommand>();
  for (const cmd of registered) {
    if (map.has(cmd.name)) {
      console.error(`[registry] Warning: duplicate command name "${cmd.name}" — last registration wins`);
    }
    map.set(cmd.name, cmd);
    for (const alias of aliases[cmd.name] ?? []) map.set(alias, cmd);
  }

  return {
    all: registered,
    aliases,
    get: (name: string) => map.get(name),
    async execute(name: string, args: unknown) {
      const cmd = map.get(name);
      if (!cmd) return { success: false, error: `Unknown command: ${name}` };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- execute() accepts the command's schema type which we cannot know statically
      return cmd.execute(args as any);
    },
  };
}
