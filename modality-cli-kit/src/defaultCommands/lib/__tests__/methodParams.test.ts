import { describe, test, expect } from "bun:test";
import { buildMethodParamsSchema, parseCounterParams } from "../methodParams";

// These two halves have to agree with `@modality-counter/core`, which the kit
// does not install — so the rules are pinned here as unit tests, and the wiring
// is verified against a real Counter install in the consuming CLI.

describe("parseCounterParams", () => {
  test("reads --key value", () => {
    expect(parseCounterParams(["--mode", "decision"])).toEqual({ mode: "decision" });
  });

  test("reads --key=value", () => {
    expect(parseCounterParams(["--mode=decision"])).toEqual({ mode: "decision" });
  });

  test("a bare flag yields true", () => {
    expect(parseCounterParams(["--refs"])).toEqual({ refs: true });
  });

  test("a flag followed by another flag yields true, not the next flag", () => {
    expect(parseCounterParams(["--refs", "--mode", "x"])).toEqual({ refs: true, mode: "x" });
  });

  test("normalizes kebab keys to snake_case", () => {
    // Counter's convention — note it is the opposite of the kit's own
    // camel→kebab rule in `zod-cli.ts`, which is why this parser exists.
    expect(parseCounterParams(["--dataset-snapshot", "{}"])).toEqual({ dataset_snapshot: "{}" });
    expect(parseCounterParams(["--dataset-snapshot={}"])).toEqual({ dataset_snapshot: "{}" });
  });

  test("ignores positional tokens", () => {
    expect(parseCounterParams(["stray", "--mode", "x", "also-stray"])).toEqual({ mode: "x" });
  });

  test("a later occurrence wins", () => {
    expect(parseCounterParams(["--mode", "a", "--mode", "b"])).toEqual({ mode: "b" });
  });

  test("values are never coerced — a number stays a string", () => {
    expect(parseCounterParams(["--current", "42"])).toEqual({ current: "42" });
  });

  test("a value of 'true' stays a string, distinct from a bare flag", () => {
    // `--verbose true` is a value; only the bare `--verbose` is the boolean.
    expect(parseCounterParams(["--verbose", "true"])).toEqual({ verbose: "true" });
  });

  test("a bare -- does not parse as a flag with an empty key", () => {
    // The shell idiom `cmd -- args` would otherwise yield an empty-key flag
    // (`""`), which the strict schema rejects with a confusing `-- — not a
    // parameter` error. The tokens after it are still read as flags: Counter
    // forwards any `--key` it sees, so validation must too.
    expect(parseCounterParams(["--mode", "x", "--", "--weird"])).toEqual({
      mode: "x",
      weird: true,
    });
  });
});

describe("buildMethodParamsSchema", () => {
  const parse = (params: Parameters<typeof buildMethodParamsSchema>[0], input: unknown) =>
    buildMethodParamsSchema(params).safeParse(input);

  test("a required parameter must be present", () => {
    const params = { trigger: { type: "object", required: true } };
    expect(parse(params, {}).success).toBe(false);
    expect(parse(params, { trigger: "{}" }).success).toBe(true);
  });

  test("a parameter is optional unless it says required", () => {
    expect(parse({ symbol: { type: "string" } }, {}).success).toBe(true);
  });

  test("a declared default implies optional and is not injected", () => {
    // Counter applies its own default; adding ours would change what the
    // method receives.
    const result = parse({ mode: { type: "string", default: "decision" } }, {});
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({});
  });

  test("options become an enum", () => {
    const params = { scope: { type: "string", options: ["full", "brief"] } };
    expect(parse(params, { scope: "full" }).success).toBe(true);
    expect(parse(params, { scope: "partial" }).success).toBe(false);
  });

  test("non-string options are stringified into the enum", () => {
    // The wire form is always a string, so numeric options match their
    // string spelling, not the number.
    const params = { scope: { type: "string", options: [1, 2] } };
    expect(parse(params, { scope: "1" }).success).toBe(true);
    expect(parse(params, { scope: "3" }).success).toBe(false);
  });

  test("string rejects a bare flag, which carries no value", () => {
    expect(parse({ symbol: { type: "string" } }, { symbol: true }).success).toBe(false);
  });

  test("number accepts a numeric string and rejects the rest", () => {
    const params = { current: { type: "number" } };
    expect(parse(params, { current: "42" }).success).toBe(true);
    expect(parse(params, { current: "-1.5" }).success).toBe(true);
    expect(parse(params, { current: "abc" }).success).toBe(false);
    expect(parse(params, { current: "" }).success).toBe(false);
    // A bare flag must not quietly coerce to 1.
    expect(parse(params, { current: true }).success).toBe(false);
  });

  test("boolean accepts the bare flag and the explicit words", () => {
    const params = { refs: { type: "boolean" } };
    expect(parse(params, { refs: true }).success).toBe(true);
    expect(parse(params, { refs: "true" }).success).toBe(true);
    expect(parse(params, { refs: "false" }).success).toBe(true);
    expect(parse(params, { refs: "yes" }).success).toBe(false);
  });

  test("object accepts a JSON object string only", () => {
    const params = { trigger: { type: "object" } };
    expect(parse(params, { trigger: '{"rule":"x"}' }).success).toBe(true);
    expect(parse(params, { trigger: "[1,2]" }).success).toBe(false);
    expect(parse(params, { trigger: "not json" }).success).toBe(false);
  });

  test("object validation does not rewrite the value", () => {
    // The caller forwards the original argv to Counter, so a transform here
    // would put the two out of step.
    const result = parse({ trigger: { type: "object" } }, { trigger: '{"a":1}' });
    expect(result.success && result.data).toEqual({ trigger: '{"a":1}' });
  });

  test("array accepts a JSON array string only", () => {
    const params = { items: { type: "array" } };
    expect(parse(params, { items: "[1,2]" }).success).toBe(true);
    expect(parse(params, { items: "{}" }).success).toBe(false);
  });

  test("an undeclared parameter is rejected, not stripped", () => {
    const result = parse({ mode: { type: "string" } }, { mode: "x", bogus: "y" });
    expect(result.success).toBe(false);
  });

  test("a method declaring no parameters accepts none", () => {
    expect(parse(undefined, {}).success).toBe(true);
    expect(parse(undefined, { anything: "x" }).success).toBe(false);
    expect(parse({}, { anything: "x" }).success).toBe(false);
  });

  test("an unsupported type throws instead of falling back to permissive", () => {
    // A z.any() fallback would switch validation off for that parameter and
    // report nothing — the exact failure this mapper must not have.
    expect(() => buildMethodParamsSchema({ x: { type: "blob" } })).toThrow(/unsupported type "blob"/);
  });

  test("a missing type throws — omission is not a way to opt out", () => {
    expect(() => buildMethodParamsSchema({ x: {} })).toThrow(/no type/);
  });
});
