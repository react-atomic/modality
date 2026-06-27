import { describe, test, expect } from "bun:test";
import {
  levenshtein,
  knownFlags,
  rejectUnknownFlags,
  buildFlagRejector,
} from "../validator";
import type { Subcommand } from "../types";

const sample: Subcommand = {
  name: "price",
  summary: "Price analysis",
  options: [
    { flag: "--timeframe", arg: "<TF>", desc: "Candle timeframe" },
    { flag: "--lookback", arg: "<N>", desc: "Lookback window" },
    { flag: "--json", desc: "JSON output" },
  ],
};

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

  test("includes subcommand options", () => {
    const flags = knownFlags(sample);
    expect(flags).toContain("--timeframe");
    expect(flags).toContain("--lookback");
  });

  test("deduplicates", () => {
    const flags = knownFlags(sample);
    const jsonFlags = flags.filter((f) => f === "--json");
    expect(jsonFlags).toHaveLength(1);
  });

  test("accepts null/undefined subcommand", () => {
    const flags = knownFlags(undefined);
    expect(flags).toContain("--help");
  });

  test("includes extra flags", () => {
    const flags = knownFlags(sample, ["--verbose"]);
    expect(flags).toContain("--verbose");
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

  test("handles null subcommand (top-level args)", () => {
    const warnings = rejectUnknownFlags(null, ["--confg"]);
    // --confg is not in the default global flags
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("buildFlagRejector", () => {
  const subcommands: Subcommand[] = [
    { name: "open", summary: "Open URL" },
    {
      name: "price",
      summary: "Price",
      options: [
        { flag: "--timeframe", arg: "<TF>", desc: "TF" },
        { flag: "--lookback", arg: "<N>", desc: "LB" },
      ],
    },
  ];

  test("returns rejector function", () => {
    const reject = buildFlagRejector(subcommands);
    expect(typeof reject).toBe("function");
  });

  test("rejects unknown flags for a known subcommand", () => {
    const reject = buildFlagRejector(subcommands);
    const warnings = reject("price", ["--timefram"]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  test("returns empty for top-level command", () => {
    const reject = buildFlagRejector(subcommands);
    const warnings = reject("nonexistent", ["--help"]);
    expect(warnings).toEqual([]);
  });
});
