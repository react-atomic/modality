import { describe, test, expect } from "bun:test";
import { z } from "zod";
import {
  inferOptionType,
  optionsToSchema,
  parseCliArgs,
  validateSubcommandArgs,
  buildSubcommandValidator,
  schemaToCliOptions,
  toKebab,
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

  test("coerced number for type: number", () => {
    const opt: Option = { flag: "--count", arg: "<N>", desc: "Count", type: "number" };
    const type = inferOptionType(opt) as z.ZodOptional<z.ZodTypeAny>;
    expect(type instanceof z.ZodOptional).toBe(true);
    expect(type.unwrap().safeParse("42").success).toBe(true);
    expect(type.unwrap().parse("42")).toBe(42);
  });

  test("enum for type: enum with values", () => {
    const opt: Option = {
      flag: "--mode", arg: "<M>", desc: "Mode", type: "enum", enumValues: ["fast", "slow"],
    };
    const type = inferOptionType(opt) as z.ZodOptional<z.ZodTypeAny>;
    expect(type.unwrap().safeParse("fast").success).toBe(true);
    expect(type.unwrap().safeParse("nope").success).toBe(false);
  });

  test("required option is not wrapped in optional", () => {
    const opt: Option = { flag: "--name", arg: "<name>", desc: "Name", required: true };
    const type = inferOptionType(opt);
    expect(type instanceof z.ZodOptional).toBe(false);
    expect(type instanceof z.ZodString).toBe(true);
  });

  test("enum with a single value degrades to literal", () => {
    const opt: Option = {
      flag: "--only", arg: "<v>", desc: "Only", type: "enum", enumValues: ["x"],
    };
    const type = inferOptionType(opt) as z.ZodOptional<z.ZodTypeAny>;
    expect(type.unwrap().safeParse("x").success).toBe(true);
    expect(type.unwrap().safeParse("y").success).toBe(false);
  });

  test("enum with empty values falls back to an accept-any string", () => {
    const opt: Option = {
      flag: "--mode", arg: "<M>", desc: "Mode", type: "enum", enumValues: [],
    };
    const type = inferOptionType(opt) as z.ZodOptional<z.ZodTypeAny>;
    expect(type.unwrap() instanceof z.ZodString).toBe(true);
    expect(type.unwrap().safeParse("anything").success).toBe(true);
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

// ── toKebab ───────────────────────────────────────────────────────────

describe("toKebab", () => {
  test("converts camelCase to kebab-case", () => {
    expect(toKebab("userDataDir")).toBe("user-data-dir");
  });

  test("handles digit boundaries", () => {
    expect(toKebab("mcpType2")).toBe("mcp-type2");
  });

  test("leaves single lowercase words unchanged", () => {
    expect(toKebab("force")).toBe("force");
  });

  test("lowercases an already-kebab string", () => {
    expect(toKebab("already-kebab")).toBe("already-kebab");
  });
});

// ── schemaToCliOptions ───────────────────────────────────────────────

describe("schemaToCliOptions", () => {
  test("string field becomes a value flag with placeholder", () => {
    const schema = z.object({ selector: z.string().describe("CSS selector") });
    const { options } = schemaToCliOptions(schema);
    expect(options[0]!.flag).toBe("--selector");
    expect(options[0]!.arg).toBe("<selector>");
    expect(options[0]!.type).toBe("string");
    expect(options[0]!.desc).toBe("CSS selector");
  });

  test("required is false for an optional field", () => {
    const schema = z.object({ force: z.boolean().optional() });
    const { options } = schemaToCliOptions(schema);
    expect(options[0]!.required).toBe(false);
    expect(options[0]!.arg).toBeUndefined(); // boolean → no value placeholder
  });

  test("required is true for a non-optional field", () => {
    const schema = z.object({ name: z.string() });
    const { options } = schemaToCliOptions(schema);
    expect(options[0]!.required).toBe(true);
  });

  test("a field with a default is treated as optional", () => {
    const schema = z.object({ count: z.coerce.number().default(1) });
    const { options } = schemaToCliOptions(schema);
    expect(options[0]!.type).toBe("number");
    expect(options[0]!.required).toBe(false);
  });

  test("enum field carries its values", () => {
    const schema = z.object({ mode: z.enum(["fast", "slow"]).optional() });
    const { options } = schemaToCliOptions(schema);
    expect(options[0]!.type).toBe("enum");
    expect(options[0]!.enumValues).toEqual(["fast", "slow"]);
  });

  test("camelCase keys become kebab-case long flags", () => {
    const schema = z.object({ userDataDir: z.string() });
    const { options } = schemaToCliOptions(schema);
    expect(options[0]!.flag).toBe("--user-data-dir");
  });

  test("single-character keys become short flags", () => {
    const schema = z.object({ f: z.boolean().optional() });
    const { options } = schemaToCliOptions(schema);
    expect(options[0]!.flag).toBe("-f");
  });

  test("keyMap position routes a field into positionals in order", () => {
    const schema = z.object({
      amount: z.string(),
      symbol: z.string(),
    });
    const { options, positionals } = schemaToCliOptions(schema, {
      symbol: { position: 0 },
      amount: { position: 1 },
    });
    expect(options).toHaveLength(0);
    expect(positionals.map((p) => p.flag)).toEqual(["--symbol", "--amount"]);
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

  test("boolean --flag=false disables; bare --flag enables", () => {
    const off = parseCliArgs(schema, ["--json=false"]);
    expect(off.data.json).toBe(false);
    expect(off.warnings).toEqual([]);

    const on = parseCliArgs(schema, ["--json=true"]);
    expect(on.data.json).toBe(true);

    const bare = parseCliArgs(schema, ["--json"]);
    expect(bare.data.json).toBe(true);
  });

  test("boolean inline falsy aliases (0/no/off) disable, case-insensitively", () => {
    for (const v of ["0", "no", "off", "FALSE", "Off"]) {
      expect(parseCliArgs(schema, [`--json=${v}`]).data.json).toBe(false);
    }
  });

  test("boolean inline non-falsy value enables", () => {
    expect(parseCliArgs(schema, ["--json=yes"]).data.json).toBe(true);
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

  test("returns bare tokens in the positionals array", () => {
    const { positionals } = parseCliArgs(schema, ["foo", "--verbose", "bar"]);
    expect(positionals).toEqual(["foo", "bar"]);
  });

  test("tokens after `--` are collected as positionals", () => {
    const { positionals } = parseCliArgs(schema, ["--", "--nope", "x"]);
    expect(positionals).toEqual(["--nope", "x"]);
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

  // ── positionals ────────────────────────────────────────────────────
  const withPositionals: Subcommand = {
    name: "convert",
    summary: "Convert a value",
    positionals: [
      { flag: "symbol", desc: "Asset symbol", required: true },
      { flag: "amount", arg: "<N>", desc: "Amount", type: "number" },
    ],
    options: [{ flag: "--json", desc: "JSON output" }],
  };

  test("maps positionals onto their keys (success path)", () => {
    const { data, warnings } = validateSubcommandArgs(withPositionals, ["BTC", "5"]);
    expect(data.symbol).toBe("BTC");
    expect(warnings).toEqual([]);
  });

  test("coerces a typed positional", () => {
    const { data } = validateSubcommandArgs(withPositionals, ["BTC", "5"]);
    expect(data.amount).toBe(5); // number, not "5"
  });

  test("required positional missing produces a validation warning", () => {
    const { warnings } = validateSubcommandArgs(withPositionals, []);
    expect(warnings.some((w) => w.startsWith("symbol"))).toBe(true);
  });

  test("positionals coexist with flags", () => {
    const { data, warnings } = validateSubcommandArgs(withPositionals, [
      "ETH", "10", "--json",
    ]);
    expect(data.symbol).toBe("ETH");
    expect(data.amount).toBe(10);
    expect(data.json).toBe(true);
    expect(warnings).toEqual([]);
  });

  // ── pre-built schema override ──────────────────────────────────────
  test("uses a pre-built ZodObject schema directly", () => {
    const custom: Subcommand = {
      name: "custom",
      summary: "Custom",
      schema: z.object({ token: z.string().optional() }),
    };
    const { data, warnings } = validateSubcommandArgs(custom, ["--token", "abc"]);
    expect(data.token).toBe("abc");
    expect(warnings).toEqual([]);
  });

  test("a positional sharing an option's name does not clobber the option", () => {
    const collide: Subcommand = {
      name: "collide",
      summary: "Collide",
      options: [{ flag: "--symbol", arg: "<S>", desc: "Symbol" }],
      positionals: [{ flag: "symbol", desc: "Symbol" }],
    };
    const { data, warnings } = validateSubcommandArgs(collide, ["--symbol", "BTC"]);
    expect(data.symbol).toBe("BTC");
    expect(warnings).toEqual([]);
  });

  test("ignores a non-ZodObject schema and falls back to options", () => {
    const bad: Subcommand = {
      name: "bad",
      summary: "Bad",
      schema: z.string(), // not a ZodObject — must not wipe out option inference
      options: [{ flag: "--json", desc: "JSON output" }],
    };
    const { data, warnings } = validateSubcommandArgs(bad, ["--json"]);
    expect(data.json).toBe(true);
    expect(warnings).toEqual([]);
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
