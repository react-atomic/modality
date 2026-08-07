// ── CLI Help Kit ────────────────────────────────────────────────────────────
// Re-export the curated /help barrel so consumers can import from
// "modality-cli-kit" without needing a /help sub-path.
export * from "./help";

// Reusable test suite: enforce the one-export-per-command-module rule.
export { setupCommandExportValidation, isCommandFile } from "./command-export-validation";
export type { CommandExportValidationOptions } from "./command-export-validation";

// ── Command Registry & Runner ────────────────────────────────────────────────
// Shareable command-registry + argv-dispatch loop so a consuming CLI only
// supplies its commands and a little config.
export { createCommandRegistry } from "./registry";
export type { CommandRegistry, CommandResolution } from "./registry";
export { createCliRunner } from "./createCliRunner";
export type { CliRunner, CliRunnerOptions } from "./createCliRunner";

// ── CLI Output Types ────────────────────────────────────────────────────────
// Shared output format types (JSON, human, JSONL) for CLI commands.
export * from "./output";

// ── Default Commands ────────────────────────────────────────────────────────
// Commands `createCliRunner` registers on every CLI's behalf. Currently the
// `merge` stdin sink, which folds a piped command chain into one document.
export { createMergeCommand, splitJsonDocs, mergeJsonDocs } from "./defaultCommands";
export type { DefaultCommandName, MergeCommandOptions } from "./defaultCommands";
