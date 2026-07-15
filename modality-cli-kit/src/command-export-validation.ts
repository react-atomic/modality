/**
 * Command Export Validation Test Suite
 *
 * Enforces the single-export rule for CLI command modules: every command file
 * must export exactly one item — its `xxxCommand` — so the command object's
 * `execute` stays the single entry point. Exporting handlers or helpers
 * alongside it invites callers (including agents) to bypass `execute` and the
 * dispatcher; genuinely reusable code belongs in a shared library instead.
 */
import { describe, test, expect } from "bun:test";
import { existsSync, readdirSync, type Dirent } from "node:fs";
import { join, isAbsolute } from "node:path";

export interface CommandExportValidationOptions {
  /** Required suffix of the single exported key. Default: "Command" */
  exportSuffix?: string;
}

/**
 * Predicate that decides whether a directory entry is a command file eligible
 * for validation. Excludes non-files, non-TS extensions, declaration files
 * (.d.ts), and test files (.test.ts, .spec.ts).
 */
export function isCommandFile(entry: Dirent): boolean {
  return (
    entry.isFile() &&
    entry.name.endsWith(".ts") &&
    !entry.name.endsWith(".d.ts") &&
    !entry.name.endsWith(".test.ts") &&
    !entry.name.endsWith(".spec.ts")
  );
}

/**
 * Setup command-export validation tests — can be imported and reused in other
 * projects:
 *
 * ```ts
 * // src/scripts/commands/__tests__/exports.test.ts
 * import { setupCommandExportValidation } from "modality-cli-kit";
 * setupCommandExportValidation(import.meta.dir + "/..");
 * ```
 */
export function setupCommandExportValidation(
  commandsDir: string,
  options: CommandExportValidationOptions = {},
): void {
  const { exportSuffix = "Command" } = options;

  if (!isAbsolute(commandsDir)) {
    // Relative paths are ambiguous at import time; require absolute.
    throw new Error(
      `setupCommandExportValidation: commandsDir must be an absolute path – ${commandsDir}`,
    );
  }
  if (!existsSync(commandsDir)) {
    // Clear error is better than opaque ENOENT
    throw new Error(
      `setupCommandExportValidation: commandsDir not found – ${commandsDir}`,
    );
  }
  const commandFiles: string[] = readdirSync(commandsDir, { withFileTypes: true })
    .filter(isCommandFile)
    .map((e) => e.name)
    .sort();

  describe(`command modules export exactly one *${exportSuffix}`, () => {
    test("commands folder is discovered", () => {
      expect(commandFiles.length).toBeGreaterThan(0);
    });

    for (const file of commandFiles) {
      test(file, async () => {
        const mod = await import(join(commandsDir, file));
        const exportedKeys = Object.keys(mod);
        expect(exportedKeys).toHaveLength(1);
        expect(exportedKeys[0]!).toEndWith(exportSuffix);
      });
    }
  });
}
