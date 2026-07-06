import { describe, test, expect } from "bun:test";
import { setupCommandExportValidation } from "../command-export-validation";

// Self-test against the fixtures: foo.ts passes the one-export rule and
// types.ts (multi-export infrastructure) is excluded by default.
setupCommandExportValidation(import.meta.dir + "/fixtures/commands");

describe("setupCommandExportValidation guards", () => {
  test("throws on missing directory", () => {
    expect(() =>
      setupCommandExportValidation("/nonexistent/commands"),
    ).toThrow(
      "setupCommandExportValidation: commandsDir not found – /nonexistent/commands",
    );
  });

  test("throws on relative path", () => {
    expect(() => setupCommandExportValidation("relative/path")).toThrow(
      "setupCommandExportValidation: commandsDir must be an absolute path – relative/path",
    );
  });
});
