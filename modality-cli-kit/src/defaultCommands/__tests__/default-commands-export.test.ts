import { describe, test, expect } from "bun:test";
import { createMergeCommand, mergeJsonDocs, splitJsonDocs } from "../../index";

// The package-root barrel re-exports the default-command helpers, so consumers
// reach them from "modality-cli-kit" without a subpath. This guards the barrel
// wiring — a broken re-export fails here even when the folder-level index tests
// pass.
describe("package-root barrel exports", () => {
  test("createMergeCommand builds the merge CLICommand", () => {
    expect(createMergeCommand().name).toBe("merge");
  });

  test("splitJsonDocs parses concatenated documents", () => {
    expect(splitJsonDocs('{"a":1}{"b":2}')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test("mergeJsonDocs unwraps envelopes", () => {
    expect(mergeJsonDocs('{"success":true,"result":{"a":1}}')).toEqual([{ a: 1 }]);
  });
});
