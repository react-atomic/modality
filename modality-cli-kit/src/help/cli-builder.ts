/**
 * Build CLI commands, help config, and validation helpers from AITool definitions.
 *
 * Given a collection of tools (each with a name, description, and Zod inputSchema),
 * this function derives `CLICommand[]` and a `HelpConfig` that can be fed directly
 * to `generateHelp()`, `rejectUnknownFlags()`, and other kit functions.
 *
 * Per-tool CLI metadata (which schema fields are positional, command aliases,
 * usage examples, flag name overrides) can be embedded on each tool object
 * via the `CLICommand` interface fields (positionals, keyMap, examples, aliases).
 *
 * @example
 * ```ts
 * import { buildCliFromTools } from "modality-cli-kit";
 * import { z } from "zod";
 *
 * const tools = [
 *   {
 *     name: "click",
 *     description: "Click on an element",
 *     inputSchema: z.object({
 *       selector: z.string().describe("CSS selector"),
 *       force: z.boolean().optional().describe("Force click"),
 *     }),
 *     positionals: ["selector"],
 *     examples: ["my-cli click .btn"],
 *   },
 * ];
 *
 * const cli = buildCliFromTools(tools, {
 *   cliName: "my-cli",
 *   tagline: "My awesome CLI",
 *   globalOptionsSchema: z.object({
 *     verbose: z.boolean().optional().describe("Show verbose output"),
 *   }),
 * });
 *
 * console.log(cli.getHelp());           // global help
 * console.log(cli.getHelp("click"));    // click help
 * cli.createFlagRejector()("click", ["--unknown"]);  // ["Unknown flag --unknown"]
 * ```
 */
import { z } from "zod";
import type { Option, HelpConfig, KeyOverride, CLICommand } from "./types";
import { schemaToCliOptions, toKebab } from "./zod-cli";
import { generateHelp, generateCommandHelp } from "./generator";
import { buildFlagRejector } from "./validator";

/** Options for `buildCliFromTools`. */
export interface BuildCliFromToolsOptions {
  /** CLI binary name (e.g. "my-cli", "co-chrome"). */
  cliName: string;
  /** One-line tagline shown at the top of global help. */
  tagline: string;
  /**
   * Zod schema for global CLI flags.
   * Each field becomes an `Option` in the global options section.
   * Flags like `--help`, `-h`, `--json` are always included by default.
   */
  globalOptionsSchema?: z.ZodObject<Record<string, z.ZodTypeAny>>;
  /** Global usage examples. */
  globalExamples?: string[];
  /** Footer text (e.g. environment hints, color toggle note). */
  footer?: string;
  /**
   * Schema keys to skip during CLI flag/positional generation for ALL tools.
   * Useful for fields shared by every tool (like `BaseArgsSchema` fields)
   * that should not appear as per-command options.
   */
  skipFields?: string[];
}

/** Result of a `buildCliFromTools` call. */
export interface CliBuildResult {
  /** Derived `CLICommand[]` — feed to `generateHelp()`, `rejectUnknownFlags()`, etc. */
  commands: CLICommand[];
  /**
   * Alias map: alias name → canonical command name.
   * Use this to look up the real command when a user types an alias.
   */
  aliases: Record<string, string>;
  /** Ready-to-go `HelpConfig` for `generateHelp()`. */
  helpConfig: HelpConfig;
  /**
   * Generate help text for one command, or global help if omitted.
   *
   * @param command  Optional command name or alias.
   */
  getHelp: (command?: string) => string;
  /**
   * Build a flag-rejection function for these commands.
   *
   * @param extraFlags  Extra global flags (e.g. `"--format"`).
   * @returns A function `(name, args) => string[]` of warnings.
   */
  createFlagRejector: (extraFlags?: string[]) => (name: string, args: string[]) => string[];
}

// ── Builder ─────────────────────────────────────────────────────────────

/**
 * Build ready-to-use CLI definitions from a collection of AI tool definitions.
 *
 * Each tool's Zod `inputSchema` is walked to derive `Option[]` for flags
 * and positional arguments. CLI metadata (positionals, aliases, examples)
 * is read from the `CLICommand` fields on each tool object.
 *
 * The returned `CliBuildResult` includes:
 * - `commands` — for use with `generateHelp()`, `rejectUnknownFlags()`, etc.
 * - `helpConfig` — pre-built `HelpConfig` for the global help page
 * - `getHelp()` — quick way to render help for any command
 * - `createFlagRejector()` — build a typed flag rejector
 */
export function buildCliFromTools(
  tools: Partial<CLICommand>[],
  options: BuildCliFromToolsOptions,
): CliBuildResult {
  const { cliName, tagline, globalOptionsSchema, globalExamples, footer, skipFields } =
    options;

  const aliases: Record<string, string> = {};
  const commands: CLICommand[] = [];

  for (const tool of tools) {
    const name = tool.name ?? "";
    if (!name) continue;

    // Collect keyMap from: positionalKeys array OR per-field keyMap,
    // plus any globally skipped fields
    const keyMap = buildKeyMap(tool.positionalKeys, tool.keyMap, skipFields);

    // Derive options/positionals from the tool's inputSchema
    let toolOptions: Option[] = [];
    let toolPositionals: Option[] = [];
    if (tool.inputSchema instanceof z.ZodObject) {
      const result = schemaToCliOptions(
        tool.inputSchema as z.ZodObject<Record<string, z.ZodTypeAny>>,
        keyMap,
      );
      toolOptions = result.options;
      toolPositionals = result.positionals;
    }

    // Strip --prefix for positional Option entries (the kit uses bare names for positionals)
    const cleanPositionals = toolPositionals.map((pos) => ({
      ...pos,
      flag: pos.flag.replace(/^--/, ""),
    }));

    const command: CLICommand = {
      name: toKebab(name),
      summary: tool.description ?? "",
      options: toolOptions,
      positionals: cleanPositionals,
      examples: tool.examples,
      usage: tool.usage,
      aliases: tool.aliases,
      positionalKeys: tool.positionalKeys,
      keyMap: tool.keyMap,
    } as CLICommand;
    commands.push(command);

    // Register aliases
    for (const alias of command.aliases ?? []) {
      aliases[alias] = command.name ?? "";
    }
  }

  // Build the global options list from the globalOptionsSchema
  let globalOptions: Option[] | undefined;
  if (globalOptionsSchema) {
    globalOptions = schemaToCliOptions(globalOptionsSchema).options;
  }

  const helpConfig: HelpConfig = {
    cliName,
    tagline,
    commands,
    globalOptions,
    globalExamples,
    footer,
  };

  return {
    commands,
    aliases,
    helpConfig,
    getHelp(command?: string): string {
      if (command) {
        const alias = aliases[command];
        const resolved = alias ?? command;
        const cmd = commands.find((s) => s.name === resolved);
        if (cmd) return generateCommandHelp(cliName, cmd, globalOptions);
        return generateCommandHelp(cliName, { name: command, summary: `Unknown command "${command}".` } as CLICommand, globalOptions);
      }
      return generateHelp(helpConfig);
    },
    createFlagRejector(extraFlags?: string[]) {
      return buildFlagRejector(commands, extraFlags);
    },
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────

/**
 * Merge the positional keys, per-field keyMap, and global skipFields into a
 * single keyMap suitable for passing to `schemaToCliOptions()`.
 */
function buildKeyMap(
  positionalKeys: string[] | undefined,
  keyMap: Record<string, KeyOverride> | undefined,
  skipFields?: string[],
): Record<string, KeyOverride> | undefined {
  const km: Record<string, KeyOverride> = {};

  // Mark globally skipped fields as hidden
  if (skipFields) {
    for (const key of skipFields) {
      km[key] = { ...km[key], hidden: true };
    }
  }

  // Copy explicit keyMap entries
  if (keyMap) {
    for (const [k, v] of Object.entries(keyMap)) {
      km[k] = { ...km[k], ...v };
    }
  }

  // Annotate positional keys with their index
  if (positionalKeys) {
    for (let i = 0; i < positionalKeys.length; i++) {
      const key = positionalKeys[i]!;
      km[key] = { ...km[key], position: i };
    }
  }

  return Object.keys(km).length > 0 ? km : undefined;
}
