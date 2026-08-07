import { afterEach, describe, test, expect } from "bun:test";
import { createMergeCommand, mergeJsonDocs, splitJsonDocs } from "..";

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

describe("splitJsonDocs", () => {
  test("parses two pretty-printed objects from one stream", () => {
    const text = '{\n  "a": 1\n}\n{\n  "b": 2\n}\n';
    expect(splitJsonDocs(text)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test("parses JSONL-style documents", () => {
    expect(splitJsonDocs('{"a":1}\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test("ignores text between documents", () => {
    const text = 'Fetching things...\n{"a":1}\nDone.\n{"b":2}\n';
    expect(splitJsonDocs(text)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test("stops at an unbalanced tail instead of crashing", () => {
    expect(splitJsonDocs('{"a":1}{"b":')).toEqual([{ a: 1 }]);
  });

  test("resyncs past a stray delimiter that is not JSON", () => {
    const text = 'log line {not json here} then {"a":1}';
    expect(splitJsonDocs(text)).toEqual([{ a: 1 }]);
  });

  test("ignores braces and brackets inside quoted strings", () => {
    const text = '{"a":"{not json}","b":"["} {"c":2}';
    expect(splitJsonDocs(text)).toEqual([{ a: "{not json}", b: "[" }, { c: 2 }]);
  });

  test("handles escaped quotes inside strings", () => {
    const text = '{"a":"say \\"hi\\""}{"b":2}';
    expect(splitJsonDocs(text)).toEqual([{ a: 'say "hi"' }, { b: 2 }]);
  });

  test("handles an escaped backslash before a closing quote", () => {
    // The trailing \\ must not escape the quote that ends the string, or the
    // scanner runs on past the end of the document.
    expect(splitJsonDocs('{"path":"C:\\\\"}{"b":2}')).toEqual([{ path: "C:\\" }, { b: 2 }]);
  });

  test("parses arrays as top-level documents", () => {
    expect(splitJsonDocs("[1,2] [3]")).toEqual([[1, 2], [3]]);
  });

  test("returns [] for empty input", () => {
    expect(splitJsonDocs("")).toEqual([]);
  });

  test("returns [] for prose with no delimiters", () => {
    expect(splitJsonDocs("just some output, nothing JSON here")).toEqual([]);
  });
});

describe("mergeJsonDocs", () => {
  test("returns every payload as an array by default", () => {
    expect(mergeJsonDocs('{"a":1}{"b":2}')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test("unwraps a { success, result } envelope to its result", () => {
    expect(mergeJsonDocs('{"success":true,"result":{"a":1}}')).toEqual([{ a: 1 }]);
  });

  test("drops a bare { success } envelope", () => {
    expect(mergeJsonDocs('{"success":true}')).toEqual([]);
  });

  test("keeps an enveloped message (no result key) whole", () => {
    expect(mergeJsonDocs('{"success":true,"message":"done"}')).toEqual([
      { success: true, message: "done" },
    ]);
  });

  test("keeps a self-printed payload without a success key", () => {
    expect(mergeJsonDocs('{"data":5}')).toEqual([{ data: 5 }]);
  });

  test("keeps a failure envelope so errors are not silently swallowed", () => {
    expect(mergeJsonDocs('{"success":false,"error":"boom"}')).toEqual([
      { success: false, error: "boom" },
    ]);
  });

  test("keeps an object whose only keys are success and data", () => {
    expect(mergeJsonDocs('{"success":true,"data":5}')).toEqual([{ success: true, data: 5 }]);
  });

  test("drops an object whose only keys are success and a non-envelope key", () => {
    expect(mergeJsonDocs('{"success":true,"timestamp":5}')).toEqual([]);
  });

  test("flat merges payloads with later documents winning", () => {
    expect(mergeJsonDocs('{"a":1,"b":1}{"b":2}', { flat: true })).toEqual({ a: 1, b: 2 });
  });

  test("unwraps an envelope whose result is null to null", () => {
    expect(mergeJsonDocs('{"success":true,"result":null}')).toEqual([null]);
  });

  test("result wins over message when both are present", () => {
    expect(mergeJsonDocs('{"success":true,"result":{"a":1},"message":"hi"}')).toEqual([{ a: 1 }]);
  });

  test("flat merges unwrapped envelopes", () => {
    expect(
      mergeJsonDocs('{"success":true,"result":{"a":1}}{"success":true,"result":{"b":2}}', {
        flat: true,
      }),
    ).toEqual({ a: 1, b: 2 });
  });

  test("flat skips non-object payloads", () => {
    expect(mergeJsonDocs('{"a":1}[1,2]', { flat: true })).toEqual({ a: 1 });
  });

  test("flat merge never rewrites the merged object's prototype", () => {
    // A payload carrying `__proto__` must not reparent the merged result —
    // its inherited keys would leak into what the consumer reads.
    const result = mergeJsonDocs('{"__proto__":{"polluted":true},"a":1}', { flat: true });
    expect(result).toEqual({ a: 1 });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });
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
