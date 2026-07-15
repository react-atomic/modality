// Fixture: a well-formed command module named index.ts.
// This file was excluded by the old `exclude` default; the new
// behavior validates it like any other command file.
const runIndex = async (): Promise<void> => undefined;

export const indexCommand = {
  name: "index",
  summary: "fixture index command",
  execute: runIndex,
};
