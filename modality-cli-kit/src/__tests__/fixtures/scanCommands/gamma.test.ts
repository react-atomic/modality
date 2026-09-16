// Fixture: test file sitting beside the commands — must never be loaded as a
// command. It deliberately exports a *Command-shaped value to prove the
// extension filter runs before the export check.
import { test, expect } from "bun:test";

export const gammaCommand = {
  name: "gamma",
  summary: "must never be registered",
  execute: async (): Promise<unknown> => ({ success: false }),
};

// The runner collects this file as a test file; give it one so the suite is
// not empty.
test("gamma fixture is a test file, not a command", () => {
  expect(gammaCommand.name).toBe("gamma");
});
