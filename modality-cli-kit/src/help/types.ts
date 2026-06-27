/**
 * Shared types for CLI help generation.
 */

/** A single CLI option / flag */
export interface Option {
  /** Flag name, e.g. "--config", "--json" */
  flag: string;
  /** Optional value placeholder, e.g. "<file>", "<N>" */
  arg?: string;
  /** Short description shown in help */
  desc: string;
}

/** A CLI subcommand */
export interface Subcommand {
  /** Subcommand name, e.g. "price", "open", "verify" */
  name: string;
  /** One-line summary shown in the subcommand index */
  summary: string;
  /** Subcommand-specific options (excludes global options) */
  options?: Option[];
  /** Custom usage lines (optional). If omitted, generates `cliName subcommand [options]` */
  usage?: string[];
  /** Example invocations */
  examples?: string[];
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
