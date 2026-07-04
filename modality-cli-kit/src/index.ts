// ── CLI Help Kit ────────────────────────────────────────────────────────────
// Direct re-exports so consumers can import from "modality-cli-kit"
// without needing a /help sub-path.
export type { CLICommand, Option, HelpConfig, KeyOverride } from "./help/types";
export type { BuildCliFromToolsOptions, CliBuildResult } from "./help/cli-builder";
export {
  generateHelp,
  generateCommandHelp,
  renderCLICommand,
  renderSection,
  // Colors
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
  // Formatter
  visibleWidth,
  padVisible,
  padName,
  flagPad,
  wrapText,
  Lines,
  DEFAULT_COL_NAME_WIDTH,
  // Validator
  levenshtein,
  fuzzySuggestion,
  knownFlags,
  rejectUnknownFlags,
  buildFlagRejector,
  DEFAULT_GLOBAL_FLAGS,
  // Zod CLI
  inferOptionType,
  schemaToCliOptions,
  toKebab,
  parseCliArgs,
  validateCLICommandArgs,
  buildCLICommandValidator,
  // CLI Builder
  buildCliFromTools,
} from "./help";
