/**
 * Shared test helpers for CLI help tests.
 */
import type { CLICommand } from "../types";

/** Build a minimal CLICommand for test fixtures without supplying execute. */
export function makeCmd(
  init: Partial<CLICommand> & { name: string },
): CLICommand {
  return { ...init, execute: async () => ({}) };
}
