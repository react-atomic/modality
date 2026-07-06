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
import { existsSync, readdirSync } from "node:fs";
import { join, isAbsolute } from "node:path";

export interface CommandExportValidationOptions {
  /**
   * Module filenames that are shared command infrastructure, not commands
   * (skipped entirely). Default: ["index.ts", "types.ts"]
   */
  exclude?: string[];
  /** Required suffix of the single exported key. Default: "Command" */
  exportSuffix?: string;
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
  const { exclude = ["index.ts", "types.ts"], exportSuffix = "Command" } = options;
  const excluded = new Set(exclude);

  const commandFiles: string[] = (() => {
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
    return readdirSync(commandsDir, { withFileTypes: true })
      .filter(
        (e) =>
          e.isFile() &&
          e.name.endsWith(".ts") &&
          !e.name.endsWith(".d.ts") &&
          !e.name.endsWith(".test.ts") &&
          !excluded.has(e.name),
      )
      .map((e) => e.name)
      .sort();
  })();

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
