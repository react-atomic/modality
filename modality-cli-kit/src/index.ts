// ── CLI Help Kit ────────────────────────────────────────────────────────────
// Re-export the curated /help barrel so consumers can import from
// "modality-cli-kit" without needing a /help sub-path.
export * from "./help";

// Reusable test suite: enforce the one-export-per-command-module rule.
export { setupCommandExportValidation, isCommandFile } from "./command-export-validation";
export type { CommandExportValidationOptions } from "./command-export-validation";
