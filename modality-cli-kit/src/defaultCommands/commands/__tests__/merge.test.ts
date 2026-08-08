import { afterEach, describe, test, expect } from "bun:test";
import { createMergeCommand } from "../merge";

// The parsing this command delegates to is covered in
// `../../lib/__tests__/jsonDocs.test.ts`; these tests cover the command surface
// — option defaults and stdin handling.

// The merge command reads process.stdin, so swap in a stub async iterable.
function stubStdin(chunks: string[], isTTY = false) {
  async function* generate() {
    for (const chunk of chunks) yield Buffer.from(chunk);
  }
  Object.defineProperty(process, "stdin", {
    value: { isTTY, [Symbol.asyncIterator]: generate },
    configurable: true,
  });
}

const realStdin = process.stdin;
afterEach(() => {
  Object.defineProperty(process, "stdin", { value: realStdin, configurable: true });
});

describe("createMergeCommand", () => {
  test("defaults name, cliName and example commands", () => {
    const cmd = createMergeCommand();
    expect(cmd.name).toBe("merge");
    expect(cmd.usage?.[0]).toContain("{ <cli> alpha --json && <cli> beta --json; } | <cli> merge");
  });

  test("honors custom name, cliName and example commands", () => {
    const cmd = createMergeCommand({
      name: "fold",
      cliName: "mycli",
      exampleCommands: ["foo", "bar"],
    });
    expect(cmd.name).toBe("fold");
    expect(cmd.usage?.[0]).toContain("{ mycli foo --json && mycli bar --json; } | mycli fold");
  });

  test("fails fast on an interactive stdin with the usage hint", async () => {
    stubStdin([], true);
    const result = await createMergeCommand().execute({});
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("reads JSON on stdin"),
    });
  });

  test("fails with a hint when stdin is empty", async () => {
    stubStdin([]);
    const result = await createMergeCommand().execute({});
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("No input on stdin"),
    });
  });

  test("merges documents from stdin", async () => {
    stubStdin(['{"success":true,"result":{"a":1}}{"b":2}']);
    const result = await createMergeCommand().execute({});
    expect(result).toEqual({ success: true, result: [{ a: 1 }, { b: 2 }] });
  });

  test("concatenates stdin chunks before parsing", async () => {
    // readStdin joins every chunk — a regression that returned only the first
    // (or last) chunk would silently drop the other document.
    stubStdin(['{"a":1}', '{"b":2}']);
    const result = await createMergeCommand().execute({});
    expect(result).toEqual({ success: true, result: [{ a: 1 }, { b: 2 }] });
  });

  test("honors the flat flag", async () => {
    stubStdin(['{"a":1}{"a":2}']);
    const result = await createMergeCommand().execute({ flat: true });
    expect(result).toEqual({ success: true, result: { a: 2 } });
  });

  test("fails when stdin contains no JSON documents", async () => {
    stubStdin(["nothing here"]);
    const result = await createMergeCommand().execute({});
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("found no JSON documents"),
    });
  });
});
