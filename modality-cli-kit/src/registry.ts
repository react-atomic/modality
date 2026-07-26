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

/**
 * Outcome of {@link CommandRegistry.resolve}. On success it carries the
 * canonical command; on failure it says whether the input matched nothing
 * (`unknown`) or several commands (`ambiguous`, with the candidate names so the
 * caller can suggest them).
 */
export type CommandResolution =
  | { found: true; name: string; command: CLICommand }
  | { found: false; reason: "unknown" | "ambiguous"; candidates: string[] };

/** A resolved command registry returned by {@link createCommandRegistry}. */
export interface CommandRegistry {
  /** All registered commands, in declaration order. */
  all: CLICommand[];
  /** Alias → canonical-command-name map (as supplied). */
  aliases: Record<string, string[]>;
  /** Resolve a command by its name or any alias. */
  get(name: string): CLICommand | undefined;
  /**
   * Resolve an input to a command. An exact name/alias always wins. With
   * `{ prefix: true }`, an input that is a unique prefix of exactly one command
   * also resolves; a prefix shared by several yields an `ambiguous` result.
   */
  resolve(input: string, options?: { prefix?: boolean }): CommandResolution;
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
  //
  // Normalize the two one-liner fields: help renders the command index from
  // `summary` and derives per-command help from `description`, but a command
  // may declare either one. Backfill each from the other so both paths render
  // regardless of which field the command author set — packages never have to
  // bridge `summary`↔`description` themselves. A command that already carries
  // both is returned untouched (identity preserved); only an under-specified
  // one is replaced with an enriched copy.
  const registered = commands
    .filter((cmd): cmd is CLICommand & { name: string } => !!cmd.name)
    .map((cmd): CLICommand & { name: string } => {
      const summary = cmd.summary ?? cmd.description;
      const description = cmd.description ?? cmd.summary;
      if (summary === cmd.summary && description === cmd.description) return cmd;
      return { ...cmd, summary, description };
    });

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
    resolve(input: string, options?: { prefix?: boolean }): CommandResolution {
      // An exact name or alias always wins, even when it is also a prefix of
      // longer names (e.g. "fx" when "fx-usd" exists).
      const exact = map.get(input);
      if (exact) return { found: true, name: exact.name!, command: exact };
      if (!options?.prefix) return { found: false, reason: "unknown", candidates: [] };

      // Match the input against every lookup key (names + aliases), then
      // collapse to distinct commands — a name and its own aliases sharing the
      // prefix is still one command, not an ambiguity.
      const commands = new Set<CLICommand>();
      for (const [key, cmd] of map) if (key.startsWith(input)) commands.add(cmd);

      if (commands.size === 1) {
        const cmd = commands.values().next().value!;
        return { found: true, name: cmd.name!, command: cmd };
      }
      if (commands.size > 1) {
        return { found: false, reason: "ambiguous", candidates: [...commands].map((c) => c.name!) };
      }
      return { found: false, reason: "unknown", candidates: [] };
    },
    async execute(name: string, args: unknown) {
      const cmd = map.get(name);
      if (!cmd) return { success: false, error: `Unknown command: ${name}` };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- execute() accepts the command's schema type which we cannot know statically
      return cmd.execute(args as any);
    },
  };
}
