import { describe, test, expect } from "bun:test";
import {
  levenshtein,
  optionFlags,
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
  inputSchema: z.object({
    timeframe: z.string().optional().describe("Candle timeframe"),
    lookback: z.coerce.number().optional().describe("Lookback window"),
    json: z.boolean().optional().describe("JSON output"),
  }),
  keyMap: { timeframe: { arg: "<TF>" }, lookback: { arg: "<N>" } },
});

// Schema-driven command mirroring real tool commands (e.g. `connect --auto`).
// Regression guard: flags must be derived from the schema, otherwise every
// one is rejected.
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

describe("optionFlags", () => {
  test("extracts flag strings from Option[]", () => {
    const flags = optionFlags([
      { flag: "--headed", desc: "Run headed" },
      { flag: "--user-data-dir", arg: "<dir>", desc: "Profile dir" },
    ]);
    expect(flags).toEqual(["--headed", "--user-data-dir"]);
  });

  test("splits combined declarations like \"--help, -h\"", () => {
    const flags = optionFlags([{ flag: "--help, -h", desc: "Show help" }]);
    expect(flags).toEqual(["--help", "-h"]);
  });

  test("feeds rejectUnknownFlags as extraFlags", () => {
    const globalOptions = [{ flag: "--user-data-dir", arg: "<dir>", desc: "Profile dir" }];
    const warnings = rejectUnknownFlags(null, ["--user-data-dir", "/tmp/x"], optionFlags(globalOptions));
    expect(warnings).toEqual([]);
  });

  test("empty array returns empty array", () => {
    expect(optionFlags([])).toEqual([]);
  });

  test("returns original flag when regex does not match (fallback path)", () => {
    // A bare dash or empty string won't match the regex (needs a word char
    // after the optional second dash), exercising the ?? [opt.flag] fallback
    const flags = optionFlags([{ flag: "-", desc: "Degenerate flag" }]);
    expect(flags).toEqual(["-"]);
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

  test("splits combined flag declarations into individual flags", () => {
    const combined = makeCmd({
      name: "x",
      summary: "x",
      positionals: [{ flag: "--verbose, -v", desc: "Verbose output" }],
    });
    const flags = knownFlags(combined);
    expect(flags).toContain("--verbose");
    expect(flags).toContain("-v");
    expect(flags).not.toContain("--verbose, -v");
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
      inputSchema: z.object({
        timeframe: z.string().optional().describe("TF"),
        lookback: z.coerce.number().optional().describe("LB"),
      }),
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
