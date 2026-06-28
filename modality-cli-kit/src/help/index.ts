/**
 * `@modality-cli-kit/help` — Composable CLI help utilities.
 *
 * ## Quick start
 *
 * ```ts
 * import { generateHelp, generateCommandHelp } from "modality-cli-kit/help";
 *
 * const subcommands = [
 *   { name: "open",  summary: "Navigate to a URL" },
 *   { name: "click", summary: "Click an element", options: [{ flag: "--selector", arg: "<sel>", desc: "CSS selector" }] },
 * ];
 *
 * console.log(generateHelp({ cliName: "my-cli", tagline: "My tool", subcommands }));
 * console.log(generateCommandHelp("my-cli", subcommands[1]));
 * ```
 */

// Colors
export {
  color,
  setNoColor,
  cmd,
  header,
  opt,
  arg,
  example,
  dim,
  bold,
  error,
  success,
  note,
  link,
} from "./colors";

// Types
export type { Option, Subcommand, HelpConfig, KeyOverride } from "./types";

// Generator
export {
  generateHelp,
  generateCommandHelp,
  renderSubcommand,
  renderSection,
} from "./generator";

// Formatter
export {
  visibleWidth,
  padVisible,
  padName,
  flagPad,
  wrapText,
  Lines,
  DEFAULT_COL_NAME_WIDTH,
} from "./formatter";

// Validator
export {
  levenshtein,
  fuzzySuggestion,
  knownFlags,
  rejectUnknownFlags,
  buildFlagRejector,
  DEFAULT_GLOBAL_FLAGS,
} from "./validator";

// Zod CLI
export {
  inferOptionType,
  optionsToSchema,
  schemaToCliOptions,
  toKebab,
  parseCliArgs,
  validateSubcommandArgs,
  buildSubcommandValidator,
} from "./zod-cli";

// CLI Builder
export { buildCliFromTools } from "./cli-builder";
export type { CliToolMeta, BuildCliFromToolsOptions, CliBuildResult } from "./cli-builder";
