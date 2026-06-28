/**
 * Shared types for CLI help generation.
 */

import type { z } from "zod";

/** A single CLI option / flag */
export interface Option {
  /** Flag name, e.g. "--config", "--json" */
  flag: string;
  /** Optional value placeholder, e.g. "<file>", "<N>" */
  arg?: string;
  /** Short description shown in help */
  desc: string;
  /**
   * Expected value type for CLI argument parsing.
   * - `"string"` (default when `arg` present) → `z.string()`
   * - `"boolean"` (default when no `arg`) → `z.boolean()`
   * - `"number"` → `z.coerce.number()`
   * - `"enum"` → requires `enumValues` → `z.enum(enumValues)`
   */
  type?: "string" | "boolean" | "number" | "enum";
  /** Allowed values when `type === "enum"` */
  enumValues?: string[];
  /** When true, the Zod schema will not be wrapped in `.optional()` */
  required?: boolean;
}

/**
 * Per-field CLI override controlling how a schema key maps to the CLI.
 * Used by `schemaToCliOptions` and `CliToolMeta.keyMap`.
 */
export interface KeyOverride {
  /** Explicit `--flag` / `-f` string (overrides the derived flag name). */
  flag?: string;
  /** Explicit value placeholder, e.g. `"<file>"`. */
  arg?: string;
  /** When set, route this field into positionals at the given index. */
  position?: number;
  /** When `true` the field is excluded from CLI flag/positional generation entirely. */
  hidden?: boolean;
}

/** A CLI subcommand */
export interface Subcommand {
  /** Subcommand name, e.g. "price", "open", "verify" */
  name: string;
  /** One-line summary shown in the subcommand index */
  summary: string;
  /** Subcommand-specific options (excludes global options) */
  options?: Option[];
  /** Ordered positional arguments (displayed in help, validated in args) */
  positionals?: Option[];
  /** Custom usage lines (optional). If omitted, generates `cliName subcommand [options]` */
  usage?: string[];
  /** Example invocations */
  examples?: string[];
  /** Pre-built Zod object schema for validation (bypasses optionsToSchema inference) */
  schema?: z.ZodTypeAny;
}

/** Global help page configuration */
export interface HelpConfig {
  /** CLI binary name, e.g. "co-chrome", "use-stock" */
  cliName: string;
  /** One-line tagline shown at the top, e.g. "Taiwan stock & TX futures CLI toolkit" */
  tagline: string;
  /** All subcommands to list */
  subcommands: Subcommand[];
  /** Subcommands sorted? If false, sorts alphabetically. */
  sorted?: boolean;
  /** Global options shown at the bottom of help */
  globalOptions?: Option[];
  /** Global examples shown at the bottom of help */
  globalExamples?: string[];
  /** Footer text (e.g. "Set NO_COLOR=1 to disable colors") */
  footer?: string;
  /** Minimum column width for subcommand name (default: 16) */
  colNameWidth?: number;
  /** Flag column width in compact mode (default: 22) */
  flagWidthCompact?: number;
  /** Flag column width in detailed mode (default: 24) */
  flagWidthDetailed?: number;
}
