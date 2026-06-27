import { describe, test, expect } from "bun:test";
import { z } from "zod";
import {
  inferOptionType,
  optionsToSchema,
  parseCliArgs,
  validateSubcommandArgs,
  buildSubcommandValidator,
} from "../zod-cli";
import type { Option, Subcommand } from "../types";

// ── inferOptionType ──────────────────────────────────────────────────

describe("inferOptionType", () => {
  test("optional boolean for options without arg", () => {
    const opt: Option = { flag: "--json", desc: "JSON output" };
    const type = inferOptionType(opt);
    expect(type instanceof z.ZodOptional).toBe(true);
    const def = type._def as { innerType?: z.ZodTypeAny };
    expect(def.innerType instanceof z.ZodBoolean).toBe(true);
  });

  test("optional string for options with arg", () => {
    const opt: Option = { flag: "--config", arg: "<file>", desc: "Config file" };
    const type = inferOptionType(opt);
    expect(type instanceof z.ZodOptional).toBe(true);
    const def = type._def as { innerType?: z.ZodTypeAny };
    expect(def.innerType instanceof z.ZodString).toBe(true);
  });

  test("boolean with default true for --no- prefix", () => {
    const opt: Option = { flag: "--no-cache", desc: "Disable cache" };
    const type = inferOptionType(opt);
    expect(type instanceof z.ZodDefault).toBe(true);
  });
});

// ── optionsToSchema ──────────────────────────────────────────────────

describe("optionsToSchema", () => {
  test("creates schema from options array", () => {
    const options: Option[] = [
      { flag: "--timeframe", arg: "<TF>", desc: "Timeframe" },
      { flag: "--json", desc: "JSON output" },
    ];
    const schema = optionsToSchema(options);
    expect(schema.shape).toHaveProperty("timeframe");
    expect(schema.shape).toHaveProperty("json");
    const tfSchema = schema.shape["timeframe"]! as z.ZodTypeAny;
    const jsonSchema = schema.shape["json"]! as z.ZodTypeAny;
    expect(tfSchema instanceof z.ZodOptional).toBe(true);
    expect(jsonSchema instanceof z.ZodOptional).toBe(true);
    const tfDef = tfSchema._def as { innerType?: z.ZodTypeAny };
    const jsonDef = jsonSchema._def as { innerType?: z.ZodTypeAny };
    expect(tfDef.innerType instanceof z.ZodString).toBe(true);
    expect(jsonDef.innerType instanceof z.ZodBoolean).toBe(true);
  });

  test("skips short flags", () => {
    const options: Option[] = [
      { flag: "-v", desc: "Verbose" },
      { flag: "--verbose", desc: "Verbose" },
    ];
    const schema = optionsToSchema(options);
    expect(schema.shape).not.toHaveProperty("v");
    expect(schema.shape).toHaveProperty("verbose");
  });

  test("handles empty options", () => {
    const schema = optionsToSchema([]);
    expect(Object.keys(schema.shape)).toHaveLength(0);
  });
});

// ── parseCliArgs ─────────────────────────────────────────────────────

describe("parseCliArgs", () => {
  const schema = z.object({
    config: z.string().optional(),
    timeout: z.coerce.number().optional(),
    verbose: z.boolean().optional(),
    json: z.boolean().optional(),
    "no-cache": z.boolean().optional(),
  });

  test("parses boolean flags", () => {
    const { data, warnings } = parseCliArgs(schema, ["--verbose", "--json"]);
    expect(data.verbose).toBe(true);
    expect(data.json).toBe(true);
    expect(warnings).toEqual([]);
  });

  test("parses string flags with values", () => {
    const { data, warnings } = parseCliArgs(schema, ["--config", ".env"]);
    expect(data.config).toBe(".env");
    expect(warnings).toEqual([]);
  });

  test("parses flag=value syntax", () => {
    const { data, warnings } = parseCliArgs(schema, ["--config=prod.yaml"]);
    expect(data.config).toBe("prod.yaml");
    expect(warnings).toEqual([]);
  });

  test("handles --no- negation", () => {
    const { data, warnings } = parseCliArgs(schema, ["--no-cache"]);
    expect(data["no-cache"]).toBe(false);
    expect(warnings).toEqual([]);
  });

  test("detects unknown flags", () => {
    const { warnings } = parseCliArgs(schema, ["--unkonwn"]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("Unknown flag");
  });

  test("fuzzy-match suggests correction", () => {
    const { warnings } = parseCliArgs(schema, ["--verobse"]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("Did you mean");
    expect(warnings[0]).toContain("--verbose");
  });

  test("`--` ends flag processing", () => {
    const { warnings } = parseCliArgs(schema, ["--", "--nope"]);
    expect(warnings).toEqual([]);
  });

  test("warns when value flag is missing its argument", () => {
    const schemaNoOpt = z.object({
      config: z.string(),
    });
    const { warnings } = parseCliArgs(schemaNoOpt, ["--config"]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("requires a value");
  });

  test("returns partial data even on schema validation failure", () => {
    const schemaRequired = z.object({
      name: z.string(),
      verbose: z.boolean().optional(),
    });
    const { data } = parseCliArgs(schemaRequired, ["--verbose"]);
    expect(data.verbose).toBe(true);
  });

  test("empty args returns empty data and no warnings", () => {
    const { data, warnings } = parseCliArgs(schema, []);
    expect(warnings).toEqual([]);
  });
});

// ── validateSubcommandArgs ───────────────────────────────────────────

describe("validateSubcommandArgs", () => {
  const sample: Subcommand = {
    name: "price",
    summary: "Price analysis",
    options: [
      { flag: "--timeframe", arg: "<TF>", desc: "Candle timeframe" },
      { flag: "--lookback", arg: "<N>", desc: "Lookback window" },
      { flag: "--json", desc: "JSON output" },
    ],
  };

  test("validates subcommand args against its options", () => {
    const { data, warnings } = validateSubcommandArgs(sample, [
      "--timeframe", "5m",
      "--json",
    ]);
    expect(data.timeframe).toBe("5m");
    expect(data.json).toBe(true);
    expect(warnings).toEqual([]);
  });

  test("returns empty for null/undefined subcommand", () => {
    expect(validateSubcommandArgs(null, ["--json"]).warnings).toEqual([]);
    expect(validateSubcommandArgs(undefined, ["--json"]).warnings).toEqual([]);
  });

  test("detects unknown flag in subcommand", () => {
    const { warnings } = validateSubcommandArgs(sample, ["--timefram"]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("Did you mean");
  });

  test("handles subcommand with no options — global flags pass through", () => {
    const noOpts: Subcommand = { name: "open", summary: "Open URL" };
    const result = validateSubcommandArgs(noOpts, ["--help", "--json"]);
    expect(result.warnings).toEqual([]);
  });
});

// ── buildSubcommandValidator ─────────────────────────────────────────

describe("buildSubcommandValidator", () => {
  const subcommands: Subcommand[] = [
    { name: "open", summary: "Open URL" },
    {
      name: "price",
      summary: "Price",
      options: [
        { flag: "--timeframe", arg: "<TF>", desc: "TF" },
        { flag: "--json", desc: "JSON" },
      ],
    },
  ];

  test("returns a validator function", () => {
    const validate = buildSubcommandValidator(subcommands);
    expect(typeof validate).toBe("function");
  });

  test("validates args for a known subcommand", () => {
    const validate = buildSubcommandValidator(subcommands);
    const { data, warnings } = validate("price", ["--timeframe", "1h"]);
    expect(data.timeframe).toBe("1h");
    expect(warnings).toEqual([]);
  });

  test("passes through global flags for unknown subcommand", () => {
    const validate = buildSubcommandValidator(subcommands);
    const result = validate("nonexistent", ["--help"]);
    expect(result.warnings).toEqual([]);
  });

  test("rejects unknown flags for known subcommand", () => {
    const validate = buildSubcommandValidator(subcommands);
    const { warnings } = validate("price", ["--timefram"]);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
