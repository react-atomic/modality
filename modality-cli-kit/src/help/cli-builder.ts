/**
 * Build CLI subcommands, help config, and validation helpers from AITool definitions.
 *
 * Given a collection of tools (each with a name, description, and Zod inputSchema),
 * this function derives `Subcommand[]` and a `HelpConfig` that can be fed directly
 * to `generateHelp()`, `rejectUnknownFlags()`, and other kit functions.
 *
 * Per-tool CLI metadata (which schema fields are positional, command aliases,
 * usage examples, flag name overrides) is supplied via the optional
 * `toolAnnotations` map.
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
 *   },
 * ];
 *
 * const cli = buildCliFromTools(tools, {
 *   cliName: "my-cli",
 *   tagline: "My awesome CLI",
 *   globalOptionsSchema: z.object({
 *     verbose: z.boolean().optional().describe("Show verbose output"),
 *   }),
 *   toolAnnotations: {
 *     click: { positionals: ["selector"], examples: ["my-cli click .btn"] },
 *   },
 * });
 *
 * console.log(cli.getHelp());           // global help
 * console.log(cli.getHelp("click"));    // click help
 * cli.createFlagRejector()("click", ["--unknown"]);  // ["Unknown flag --unknown"]
 * ```
 */
import { z } from "zod";
import type { Option, Subcommand, HelpConfig, KeyOverride } from "./types";
import { schemaToCliOptions, toKebab } from "./zod-cli";
import { generateHelp, generateCommandHelp } from "./generator";
import { buildFlagRejector } from "./validator";

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * Per-tool CLI annotations that tell the builder how to map the tool's
 * `inputSchema` into CLI positional vs flag args.
 */
export interface CliToolMeta {
  /**
   * Which `inputSchema` keys are positional args (in declaration order).
   * Keys NOT listed here become `--flag` options.
   */
  positionals?: string[];
  /** Alternative command names that map to this tool (aliases). */
  aliases?: string[];
  /** Usage/example lines shown in the subcommand's help text. */
  examples?: string[];
  /**
   * Override the subcommand name (defaults to the tool's `name` field).
   * Use when the tool name isn't a valid CLI subcommand name.
   */
  name?: string;
  /**
   * Override the description (defaults to the tool's `description` field).
   */
  description?: string;
  /**
   * Custom usage line displayed in the subcommand's help header,
   * e.g. `"my-cli cmd <src> <dst> [options]"`.
   */
  usage?: string;
  /**
   * Per-field overrides for CLI flag generation:
   * - `flag`: explicit `--flag-name` or `-f` (overrides the schema key)
   * - `arg`: explicit placeholder, e.g. `"<file>"` (overrides the arg placeholder)
   * - `position`: make this field a positional arg at index N
   * - `hidden`: exclude this field from the CLI entirely
   */
  keyMap?: Record<string, KeyOverride>;
}

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
   * Per-tool CLI metadata (positionals, aliases, examples, key overrides).
   * Keys are tool names (as they appear in the tools array).
   */
  toolAnnotations?: Record<string, CliToolMeta>;
  /**
   * Schema keys to skip during CLI flag/positional generation for ALL tools.
   * Useful for fields shared by every tool (like `BaseArgsSchema` fields)
   * that should not appear as per-command options.
   */
  skipFields?: string[];
}

/** Result of a `buildCliFromTools` call. */
export interface CliBuildResult {
  /** Derived `Subcommand[]` — feed to `generateHelp()`, `rejectUnknownFlags()`, etc. */
  subcommands: Subcommand[];
  /**
   * Alias map: alias name → canonical subcommand name.
   * Use this to look up the real subcommand when a user types an alias.
   */
  aliases: Record<string, string>;
  /** Ready-to-go `HelpConfig` for `generateHelp()`. */
  helpConfig: HelpConfig;
  /**
   * Generate help text for one subcommand, or global help if omitted.
   *
   * @param command  Optional subcommand name or alias.
   */
  getHelp: (command?: string) => string;
  /**
   * Build a flag-rejection function for these subcommands.
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
 * is provided via the optional `toolAnnotations` map.
 *
 * The returned `CliBuildResult` includes:
 * - `subcommands` — for use with `generateHelp()`, `rejectUnknownFlags()`, etc.
 * - `helpConfig` — pre-built `HelpConfig` for the global help page
 * - `getHelp()` — quick way to render help for any command
 * - `createFlagRejector()` — build a typed flag rejector
 */
export function buildCliFromTools(
  tools: Array<{
    name?: string;
    description?: string;
    inputSchema?: z.ZodTypeAny;
  }>,
  options: BuildCliFromToolsOptions,
): CliBuildResult {
  const { cliName, tagline, globalOptionsSchema, globalExamples, footer, toolAnnotations, skipFields } =
    options;

  const aliases: Record<string, string> = {};
  const subcommands: Subcommand[] = [];

  for (const tool of tools) {
    const name = tool.name ?? "";
    if (!name) continue;

    const meta = toolAnnotations?.[name];

    // Collect keyMap from: top-level positionals array OR per-field keyMap,
    // plus any globally skipped fields
    const keyMap = buildKeyMap(meta, skipFields);

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

    const subcommand: Subcommand = {
      name: meta?.name ?? toKebab(name),
      summary: meta?.description ?? tool.description ?? "",
      options: toolOptions,
      positionals: cleanPositionals,
      examples: meta?.examples,
      usage: meta?.usage ? [meta.usage] : undefined,
    };
    subcommands.push(subcommand);

    // Register aliases
    for (const alias of meta?.aliases ?? []) {
      aliases[alias] = subcommand.name;
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
    subcommands,
    globalOptions,
    globalExamples,
    footer,
  };

  return {
    subcommands,
    aliases,
    helpConfig,
    getHelp(command?: string): string {
      if (command) {
        const alias = aliases[command];
        const resolved = alias ?? command;
        const sc = subcommands.find((s) => s.name === resolved);
        if (sc) return generateCommandHelp(cliName, sc, globalOptions);
        return generateCommandHelp(cliName, {
          name: command,
          summary: `Unknown command "${command}".`,
        });
      }
      return generateHelp(helpConfig);
    },
    createFlagRejector(extraFlags?: string[]) {
      return buildFlagRejector(subcommands, extraFlags);
    },
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────

/**
 * Merge the positionals list, per-field keyMap, and global skipFields into a
 * single keyMap suitable for passing to `schemaToCliOptions()`.
 */
function buildKeyMap(
  meta: CliToolMeta | undefined,
  skipFields?: string[],
): Record<string, KeyOverride> | undefined {
  const km: Record<string, KeyOverride> = {};

  // Mark globally skipped fields as hidden
  if (skipFields) {
    for (const key of skipFields) {
      km[key] = { ...km[key], hidden: true };
    }
  }

  if (!meta) return Object.keys(km).length > 0 ? km : undefined;

  // Copy explicit keyMap entries
  if (meta.keyMap) {
    for (const [k, v] of Object.entries(meta.keyMap)) {
      km[k] = { ...km[k], ...v };
    }
  }

  // Annotate positional keys with their index
  if (meta.positionals) {
    for (let i = 0; i < meta.positionals.length; i++) {
      const key = meta.positionals[i]!;
      km[key] = { ...km[key], position: i };
    }
  }

  return Object.keys(km).length > 0 ? km : undefined;
}
