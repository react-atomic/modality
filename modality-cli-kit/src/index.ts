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
export type { CommandRegistry } from "./registry";
export { createCliRunner } from "./runner";
export type { CliRunner, CliRunnerOptions } from "./runner";

// ── CLI Output Types ────────────────────────────────────────────────────────
// Shared output format types (JSON, human, JSONL) for CLI commands.
export * from "./output";
