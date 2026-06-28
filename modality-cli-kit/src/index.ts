// ── CLI Help Kit ────────────────────────────────────────────────────────────
// Direct re-exports so consumers can import { Subcommand, generateHelp, ... }
// from "modality-cli-kit" without needing a /help sub-path.
export type { Subcommand, Option, HelpConfig, KeyOverride } from "./help/types";
export {
  generateHelp,
  generateCommandHelp,
  renderSubcommand,
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
  optionsToSchema,
  schemaToCliOptions,
  toKebab,
  parseCliArgs,
  validateSubcommandArgs,
  buildSubcommandValidator,
  // CLI Builder
  buildCliFromTools,
} from "./help";
