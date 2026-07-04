/**
 * `@modality-cli-kit/help` — Composable CLI help utilities.
 *
 * ## Quick start
 *
 * ```ts
 * import { z } from "zod";
 * import { generateHelp, generateCommandHelp } from "modality-cli-kit/help";
 *
 * const commands = [
 *   { name: "open",  summary: "Navigate to a URL" },
 *   {
 *     name: "click",
 *     summary: "Click an element",
 *     inputSchema: z.object({ selector: z.string().optional().describe("CSS selector") }),
 *   },
 * ];
 *
 * console.log(generateHelp({ cliName: "my-cli", tagline: "My tool", commands }));
 * console.log(generateCommandHelp("my-cli", commands[1]));
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
export type { Option, CLICommand, HelpConfig, KeyOverride } from "./types";

// Generator
export {
  generateHelp,
  generateCommandHelp,
  renderCLICommand,
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
  schemaToCliOptions,
  toKebab,
  parseCliArgs,
  validateCLICommandArgs,
  buildCLICommandValidator,
} from "./zod-cli";

// CLI Builder
export { buildCliFromTools } from "./cli-builder";
export type { BuildCliFromToolsOptions, CliBuildResult } from "./cli-builder";
