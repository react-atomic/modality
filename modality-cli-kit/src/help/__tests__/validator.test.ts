import { describe, test, expect } from "bun:test";
import {
  levenshtein,
  knownFlags,
  rejectUnknownFlags,
  buildFlagRejector,
} from "../validator";
import type { CLICommand } from "../types";
import { makeCmd } from "./helpers";
import { z } from "zod";

const sample: CLICommand = makeCmd({
  name: "price",
  summary: "Price analysis",
  options: [
    { flag: "--timeframe", arg: "<TF>", desc: "Candle timeframe" },
    { flag: "--lookback", arg: "<N>", desc: "Lookback window" },
    { flag: "--json", desc: "JSON output" },
  ],
});

// Schema-driven command whose flags live in `inputSchema`, not `.options` —
// mirrors real tool commands (e.g. `connect --auto`). Regression guard: these
// flags must be derived from the schema, otherwise every one is rejected.
const schemaDriven: CLICommand = makeCmd({
  name: "connect",
  summary: "Connect to a browser",
  inputSchema: z.object({
    auto: z.boolean().optional().describe("Use M144+ remote debugging"),
    channel: z.string().optional().describe("Chrome channel"),
  }),
  keyMap: { auto: { flag: "--auto" } },
});

describe("levenshtein", () => {
  test("identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  test("empty strings", () => {
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });

  test("single substitution", () => {
    expect(levenshtein("cat", "car")).toBe(1);
  });

  test("real-world flag typos", () => {
    // "config" vs "config" should be small
    expect(levenshtein("--config", "--config")).toBe(0);
    // "confg" vs "config"
    expect(levenshtein("--confg", "--config")).toBe(1);
    // "timefram" vs "timeframe"
    expect(levenshtein("--timefram", "--timeframe")).toBe(1);
  });
});

describe("knownFlags", () => {
  test("includes default global flags", () => {
    const flags = knownFlags(null);
    expect(flags).toContain("--help");
    expect(flags).toContain("-h");
    expect(flags).toContain("--json");
  });

  test("includes command options", () => {
    const flags = knownFlags(sample);
    expect(flags).toContain("--timeframe");
    expect(flags).toContain("--lookback");
  });

  test("deduplicates", () => {
    const flags = knownFlags(sample);
    const jsonFlags = flags.filter((f) => f === "--json");
    expect(jsonFlags).toHaveLength(1);
  });

  test("accepts null/undefined command", () => {
    const flags = knownFlags(undefined);
    expect(flags).toContain("--help");
  });

  test("includes extra flags", () => {
    const flags = knownFlags(sample, ["--verbose"]);
    expect(flags).toContain("--verbose");
  });

  test("derives flags from inputSchema when options is absent", () => {
    const flags = knownFlags(schemaDriven);
    expect(flags).toContain("--auto");
    expect(flags).toContain("--channel");
  });
});

describe("rejectUnknownFlags", () => {
  test("no warnings for empty args", () => {
    expect(rejectUnknownFlags(sample, [])).toEqual([]);
  });

  test("no warnings for known flags", () => {
    expect(rejectUnknownFlags(sample, ["--timeframe", "5m", "--json"])).toEqual([]);
  });

  test("detects unknown long flag", () => {
    const warnings = rejectUnknownFlags(sample, ["--unkonwn"]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("Unknown flag");
  });

  test("fuzzy-match suggests correction", () => {
    const warnings = rejectUnknownFlags(sample, ["--timefram"]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("Did you mean");
    expect(warnings[0]).toContain("--timeframe");
  });

  test("`--` ends flag processing", () => {
    // After --, unknown flags should pass silently
    const warnings = rejectUnknownFlags(sample, ["--", "--nope"]);
    expect(warnings).toEqual([]);
  });

  test("handles single-dash flags", () => {
    const warnings = rejectUnknownFlags(sample, ["-z"]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("short flags not supported");
  });

  test("handles null command (top-level args)", () => {
    const warnings = rejectUnknownFlags(null, ["--confg"]);
    // --confg is not in the default global flags
    expect(warnings.length).toBeGreaterThan(0);
  });

  test("accepts schema-driven flags and still rejects typos", () => {
    // `connect --auto` must pass; `--atuo` must fuzzy-suggest `--auto`.
    expect(rejectUnknownFlags(schemaDriven, ["--auto"])).toEqual([]);
    const warnings = rejectUnknownFlags(schemaDriven, ["--atuo"]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("--auto");
  });

  test("accepts --flag=value inline syntax", () => {
    const warnings = rejectUnknownFlags(sample, ["--timeframe=5m", "--json=false"]);
    expect(warnings).toEqual([]);
  });

  test("fuzzy-suggests on typo with --flag=value inline syntax", () => {
    const warnings = rejectUnknownFlags(sample, ["--timefram=5m"]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("--timeframe");
    expect(warnings[0]).toContain("Did you mean");
  });

  test("accepts --no-* negation for known boolean flags", () => {
    // --no-cache is in DEFAULT_GLOBAL_FLAGS
    expect(rejectUnknownFlags(sample, ["--no-cache"])).toEqual([]);
  });

  test("accepts schema-driven --no-* negation for boolean fields", () => {
    // auto is a boolean schema field → --no-auto negates it
    expect(rejectUnknownFlags(schemaDriven, ["--no-auto"])).toEqual([]);
  });

  test("still rejects --no-* for genuinely unknown flags", () => {
    const warnings = rejectUnknownFlags(sample, ["--no-unknwn"]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("Unknown flag");
  });
});

describe("buildFlagRejector", () => {
  const commands: CLICommand[] = [
    makeCmd({ name: "open", summary: "Open URL" }),
    makeCmd({
      name: "price",
      summary: "Price",
      options: [
        { flag: "--timeframe", arg: "<TF>", desc: "TF" },
        { flag: "--lookback", arg: "<N>", desc: "LB" },
      ],
    }),
  ];

  test("returns rejector function", () => {
    const reject = buildFlagRejector(commands);
    expect(typeof reject).toBe("function");
  });

  test("rejects unknown flags for a known command", () => {
    const reject = buildFlagRejector(commands);
    const warnings = reject("price", ["--timefram"]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  test("returns empty for top-level command", () => {
    const reject = buildFlagRejector(commands);
    const warnings = reject("nonexistent", ["--help"]);
    expect(warnings).toEqual([]);
  });

  test("throws when a command has no name", () => {
    const nameless = { summary: "no name" } as CLICommand;
    expect(() => buildFlagRejector([nameless])).toThrow(/must have a `name`/);
  });
});
