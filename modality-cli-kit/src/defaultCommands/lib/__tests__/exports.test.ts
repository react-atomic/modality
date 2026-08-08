import { describe, test, expect } from "bun:test";

// The merge helpers live in `lib/jsonDocs.ts` and are re-exported at the
// package root ("modality-cli-kit"), so their names and count are public API.
// Pin the surface: an internal accidentally exported here (e.g. scanBalanced)
// would grow the contract consumers depend on, and a rename would orphan the
// barrel's `export { splitJsonDocs, mergeJsonDocs }` at import time.
describe("lib/jsonDocs export surface", () => {
  test("exports exactly the two merge helpers", async () => {
    const mod = await import("../jsonDocs");
    expect(Object.keys(mod).sort()).toEqual(["mergeJsonDocs", "splitJsonDocs"]);
  });
});
