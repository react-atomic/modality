import { describe, test, expect } from "bun:test";
import { z } from "zod";
import {
  inferOptionType,
  parseCliArgs,
  validateCLICommandArgs,
  buildCLICommandValidator,
  schemaToCliOptions,
  toKebab,
  normalizeSchemaKeys,
  buildKeyMap,
  createFlatCommandSchema,
} from "../zod-cli";
import type { Option, CLICommand } from "../types";
import { makeCmd } from "./helpers";

// ── inferOptionType ──────────────────────────────────────────────────

describe("inferOptionType", () => {
  test("optional boolean for options without arg", () => {
    const opt: Option = { flag: "--json", desc: "JSON output" };
    const type = inferOptionType(opt);
    expect(type instanceof z.ZodOptional).toBe(true);
    expect((type as z.ZodOptional<z.ZodTypeAny>).unwrap() instanceof z.ZodBoolean).toBe(true);
  });

  test("optional string for options with arg", () => {
    const opt: Option = { flag: "--config", arg: "<file>", desc: "Config file" };
    const type = inferOptionType(opt);
    expect(type instanceof z.ZodOptional).toBe(true);
    expect((type as z.ZodOptional<z.ZodTypeAny>).unwrap() instanceof z.ZodString).toBe(true);
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
    expect(positionals.map((p) => p.flag)).toEqual(["symbol", "amount"]);
  });

  test("keyMap hidden excludes a field from options", () => {
    const schema = z.object({
      config: z.string().optional(),
      token: z.string().optional(),
    });
    const { options } = schemaToCliOptions(schema, {
      token: { hidden: true },
    });
    expect(options.map((o) => o.flag)).toEqual(["--config"]);
  });

  test("keyMap hidden excludes a field from positionals", () => {
    const schema = z.object({
      id: z.string(),
      secret: z.string(),
    });
    const { options, positionals } = schemaToCliOptions(schema, {
      id: { position: 0 },
      secret: { position: 1, hidden: true },
    });
    expect(options).toHaveLength(0);
    expect(positionals.map((p) => p.flag)).toEqual(["id"]);
  });
});

// ── buildKeyMap ───────────────────────────────────────────────────────

describe("buildKeyMap", () => {
  test("empty inputs returns undefined", () => {
    expect(buildKeyMap(undefined, undefined)).toBeUndefined();
    expect(buildKeyMap([], {})).toBeUndefined();
    expect(buildKeyMap([], undefined, [])).toBeUndefined();
  });

  test("skipFields marks each field as hidden", () => {
    const km = buildKeyMap(undefined, undefined, ["secret", "token"]);
    expect(km).toBeDefined();
    expect(km!["secret"]).toEqual({ hidden: true });
    expect(km!["token"]).toEqual({ hidden: true });
  });

  test("keyMap entries are preserved", () => {
    const km = buildKeyMap(undefined, { timeout: { arg: "<ms>", flag: "--timeout-ms" } });
    expect(km).toBeDefined();
    expect(km!["timeout"]).toEqual({ arg: "<ms>", flag: "--timeout-ms" });
  });

  test("positionalKeys set position indices in order", () => {
    const km = buildKeyMap(["symbol", "amount"], undefined);
    expect(km).toBeDefined();
    expect(km!["symbol"]).toEqual({ position: 0 });
    expect(km!["amount"]).toEqual({ position: 1 });
  });

  test("explicit keyMap overrides do not clobber skipFields hidden mark", () => {
    const km = buildKeyMap(undefined, { secret: { flag: "--show-secret" } }, ["secret"]);
    expect(km!["secret"]).toEqual({ hidden: true, flag: "--show-secret" });
  });

  test("keyMap can un-hide a globally skipped field", () => {
    const km = buildKeyMap(undefined, { secret: { hidden: false } }, ["secret"]);
    expect(km!["secret"]).toEqual({ hidden: false });
  });

  test("positionalKeys coexist with skipFields", () => {
    const km = buildKeyMap(["symbol"], undefined, ["token"]);
    expect(km!["symbol"]).toEqual({ position: 0 });
    expect(km!["token"]).toEqual({ hidden: true });
  });

  test("all sources merge into one map", () => {
    const km = buildKeyMap(
      ["symbol"],
      { symbol: { flag: "--sym" }, amount: { arg: "<N>" } },
      ["secret"],
    );
    expect(km!["symbol"]).toEqual({ position: 0, flag: "--sym" });
    expect(km!["amount"]).toEqual({ arg: "<N>" });
    expect(km!["secret"]).toEqual({ hidden: true });
  });
});

// ── normalizeSchemaKeys ──────────────────────────────────────────────

describe("normalizeSchemaKeys", () => {
  test("returns the same schema when no keys change and no hidden fields", () => {
    const input = z.object({ force: z.boolean(), timeout: z.coerce.number() });
    const result = normalizeSchemaKeys(input);
    expect(result).toBe(input);
  });

  test("normalizes camelCase keys to kebab-case", () => {
    const input = z.object({ userDataDir: z.string() });
    const result = normalizeSchemaKeys(input);
    expect(result.shape).toHaveProperty("user-data-dir");
    expect(result.shape).not.toHaveProperty("userDataDir");
  });

  test("excludes fields marked hidden in keyMap", () => {
    const input = z.object({ visible: z.string(), secret: z.string() });
    const result = normalizeSchemaKeys(input, { secret: { hidden: true } });
    expect(result.shape).toHaveProperty("visible");
    expect(result.shape).not.toHaveProperty("secret");
  });

  test("preserves non-hidden fields when some are hidden", () => {
    const input = z.object({ a: z.string(), b: z.string(), c: z.string() });
    const result = normalizeSchemaKeys(input, {
      a: { hidden: true },
      c: { hidden: true },
    });
    expect(result.shape).toHaveProperty("b");
    expect(result.shape).not.toHaveProperty("a");
    expect(result.shape).not.toHaveProperty("c");
  });

  test("handles combined hidden + renamed fields", () => {
    const input = z.object({ visible: z.string(), hiddenField: z.string() });
    const result = normalizeSchemaKeys(input, { hiddenField: { hidden: true } });
    expect(result.shape).toHaveProperty("visible");
    expect(result.shape).not.toHaveProperty("hiddenField");
    expect(result).not.toBe(input);
  });

  test("normalizes and hides simultaneously", () => {
    const input = z.object({ myField: z.string(), skipMe: z.string() });
    const result = normalizeSchemaKeys(input, { skipMe: { hidden: true } });
    expect(result.shape).toHaveProperty("my-field");
    expect(result.shape).not.toHaveProperty("myField");
    expect(result.shape).not.toHaveProperty("skipMe");
  });

  test("empty schema is a no-op", () => {
    const input = z.object({});
    expect(normalizeSchemaKeys(input)).toBe(input);
  });

  test("nullish keyMap does not affect output", () => {
    const input = z.object({ name: z.string() });
    expect(normalizeSchemaKeys(input, undefined)).toBe(input);
    expect(normalizeSchemaKeys(input, {})).toBe(input);
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

  test("short flags map to single-character schema keys", () => {
    const short = z.object({ f: z.boolean().optional() });
    const { data, warnings } = parseCliArgs(short, ["-f"]);
    expect(data.f).toBe(true);
    expect(warnings).toEqual([]);
  });

  test("unknown short flag warning echoes the actual token", () => {
    const { warnings } = parseCliArgs(schema, ["-x"]);
    expect(warnings[0]).toContain("Unknown flag -x");
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
    const { warnings } = parseCliArgs(schema, []);
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

  test("object-level refinement produces warning without path prefix", () => {
    const pairedSchema = z
      .object({
        stop: z.coerce.number().positive().optional(),
        target: z.coerce.number().positive().optional(),
      })
      .refine((v) => (v.stop === undefined) === (v.target === undefined), {
        message: "--stop and --target must be provided together",
      });
    const { data, warnings } = parseCliArgs(pairedSchema, ["--stop", "150"]);
    // No ": " prefix because issue.path is empty for object-level refinements
    expect(warnings[0]).toBe("--stop and --target must be provided together");
    // Partial data (raw string since validation failed — Zod coercion doesn't apply)
    // Cast to Record<string, unknown> because the return type is z.output (number)
    expect((data as Record<string, unknown>).stop).toBe("150");
  });
});

// ── validateCLICommandArgs ───────────────────────────────────────────

describe("validateCLICommandArgs", () => {
  const sample: CLICommand = makeCmd({
    name: "price",
    summary: "Price analysis",
    inputSchema: z.object({
      timeframe: z.string().optional().describe("Candle timeframe"),
      lookback: z.coerce.number().optional().describe("Lookback window"),
      json: z.boolean().optional().describe("JSON output"),
    }),
  });

  test("validates command args against its inputSchema", () => {
    const { data, warnings } = validateCLICommandArgs(sample, [
      "--timeframe", "5m",
      "--json",
    ]);
    expect(data.timeframe).toBe("5m");
    expect(data.json).toBe(true);
    expect(warnings).toEqual([]);
  });

  test("returns empty for null/undefined command", () => {
    expect(validateCLICommandArgs(null, ["--json"]).warnings).toEqual([]);
    expect(validateCLICommandArgs(undefined, ["--json"]).warnings).toEqual([]);
  });

  test("detects unknown flag in command", () => {
    const { warnings } = validateCLICommandArgs(sample, ["--timefram"]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("Did you mean");
  });

  test("handles command with no schema — global flags pass through", () => {
    const noOpts: CLICommand = makeCmd({ name: "open", summary: "Open URL" });
    const result = validateCLICommandArgs(noOpts, ["--help", "--json"]);
    expect(result.warnings).toEqual([]);
  });

  test("extraFlags add to the default global flags instead of replacing them", () => {
    const { warnings } = validateCLICommandArgs(sample, ["--json", "--format"], ["--format"]);
    expect(warnings).toEqual([]);
  });

  // ── positionals ────────────────────────────────────────────────────
  const withPositionals: CLICommand = makeCmd({
    name: "convert",
    summary: "Convert a value",
    inputSchema: z.object({
      symbol: z.string().describe("Asset symbol"),
      amount: z.coerce.number().optional().describe("Amount"),
      json: z.boolean().optional().describe("JSON output"),
    }),
    positionals: [
      { flag: "symbol", desc: "Asset symbol", required: true },
      { flag: "amount", arg: "<N>", desc: "Amount", type: "number" },
    ],
  });

  test("maps positionals onto their keys (success path)", () => {
    const { data, warnings } = validateCLICommandArgs(withPositionals, ["BTC", "5"]);
    expect(data.symbol).toBe("BTC");
    expect(warnings).toEqual([]);
  });

  test("coerces a typed positional", () => {
    const { data } = validateCLICommandArgs(withPositionals, ["BTC", "5"]);
    expect(data.amount).toBe(5); // number, not "5"
  });

  test("required positional missing produces a validation warning", () => {
    const { warnings } = validateCLICommandArgs(withPositionals, []);
    expect(warnings.some((w) => w.startsWith("symbol"))).toBe(true);
  });

  test("positionals coexist with flags", () => {
    const { data, warnings } = validateCLICommandArgs(withPositionals, [
      "ETH", "10", "--json",
    ]);
    expect(data.symbol).toBe("ETH");
    expect(data.amount).toBe(10);
    expect(data.json).toBe(true);
    expect(warnings).toEqual([]);
  });

  // ── inputSchema-driven validation ────────────────────────────────────
  test("uses inputSchema directly (with key normalization)", () => {
    const custom: CLICommand = makeCmd({
      name: "custom",
      summary: "Custom",
      inputSchema: z.object({ token: z.string().optional() }),
    });
    const { data, warnings } = validateCLICommandArgs(custom, ["--token", "abc"]);
    expect(data.token).toBe("abc");
    expect(warnings).toEqual([]);
  });

  test("a positional sharing a flag's name does not clobber the flag value", () => {
    const collide: CLICommand = makeCmd({
      name: "collide",
      summary: "Collide",
      inputSchema: z.object({ symbol: z.string().optional().describe("Symbol") }),
      positionals: [{ flag: "symbol", desc: "Symbol" }],
    });
    const { data, warnings } = validateCLICommandArgs(collide, ["--symbol", "BTC"]);
    expect(data.symbol).toBe("BTC");
    expect(warnings).toEqual([]);
  });

  test("normalizes camelCase inputSchema keys for CLI flag matching", () => {
    const custom: CLICommand = makeCmd({
      name: "custom",
      summary: "Custom",
      inputSchema: z.object({ userDataDir: z.string().optional() }),
    });
    const { data, warnings } = validateCLICommandArgs(custom, ["--user-data-dir", "/tmp"]);
    expect(data["user-data-dir"]).toBe("/tmp");
    expect(warnings).toEqual([]);
  });

  test("--no- negation works with normalized noCache-style inputSchema keys", () => {
    const custom: CLICommand = makeCmd({
      name: "custom",
      summary: "Custom",
      inputSchema: z.object({ noCache: z.boolean().default(true) }),
    });
    const { data, warnings } = validateCLICommandArgs(custom, ["--no-cache"]);
    expect(data["no-cache"]).toBe(false);
    expect(warnings).toEqual([]);
  });

  test("schema-only command: positionalKeys (no explicit positionals) maps args to kebab-ized keys", () => {
    const cmd: CLICommand = makeCmd({
      name: "validate",
      summary: "Validate",
      inputSchema: z.object({
        assetSymbol: z.string().describe("Asset symbol"),
        lookbackDays: z.coerce.number().optional().describe("Lookback days"),
      }),
      // No explicit `positionals[]` — must use toKebab() path for keys
      positionalKeys: ["assetSymbol", "lookbackDays"],
    });
    const { data, warnings } = validateCLICommandArgs(cmd, ["BTC", "5"]);
    expect(data["asset-symbol"]).toBe("BTC");
    expect(data["lookback-days"]).toBe(5);
    expect(warnings).toEqual([]);
  });

  test("schema-only command: positionalKeys with bare lower-case keys also maps correctly", () => {
    const cmd: CLICommand = makeCmd({
      name: "bare-pos",
      summary: "Bare positionals",
      inputSchema: z.object({
        symbol: z.string().describe("Symbol"),
        amount: z.coerce.number().optional().describe("Amount"),
      }),
      positionalKeys: ["symbol", "amount"],
    });
    const { data, warnings } = validateCLICommandArgs(cmd, ["BTC", "5"]);
    expect(data.symbol).toBe("BTC");
    expect(data.amount).toBe(5);
    expect(warnings).toEqual([]);
  });

  test("ignores a non-ZodObject inputSchema and falls back to global flags", () => {
    const bad: CLICommand = makeCmd({
      name: "bad",
      summary: "Bad",
      inputSchema: z.string(), // not a ZodObject — must not crash validation
    });
    const { data, warnings } = validateCLICommandArgs(bad, ["--json"]);
    expect(data.json).toBe(true);
    expect(warnings).toEqual([]);
  });

  test("preserves object-level refinements on inputSchema (paired flags)", () => {
    const paired: CLICommand = makeCmd({
      name: "paired",
      summary: "Paired flags",
      inputSchema: z
        .object({
          stop: z.coerce.number().positive().optional(),
          target: z.coerce.number().positive().optional(),
        })
        .refine((v) => (v.stop === undefined) === (v.target === undefined), {
          message: "--stop and --target must be provided together",
        }),
    });

    const bad = validateCLICommandArgs(paired, ["--stop", "150"]);
    // Object-level refinements have an empty path — no "field:" prefix
    expect(bad.warnings.some((w) => w.includes("provided together"))).toBe(true);
    expect(bad.warnings[0]).not.toMatch(/^:\s/);

    const good = validateCLICommandArgs(paired, ["--stop", "150", "--target", "250"]);
    expect(good.warnings).toEqual([]);
    expect(good.data.stop).toBe(150);
    expect(good.data.target).toBe(250);
  });

  test("hidden keyMap fields are excluded from inputSchema validation", () => {
    const cmd: CLICommand = makeCmd({
      name: "hidden-test",
      summary: "Hidden",
      inputSchema: z.object({
        visible: z.string().optional(),
        secret: z.string(),           // required but hidden — must not fail
      }),
      keyMap: { secret: { hidden: true } },
    });
    const { data, warnings } = validateCLICommandArgs(cmd, ["--visible", "hello"]);
    expect(data.visible).toBe("hello");
    expect(warnings).toEqual([]);
    // "secret" should NOT be in the normalized schema
    expect(data).not.toHaveProperty("secret");
  });
});

// ── buildCLICommandValidator ─────────────────────────────────────────

describe("buildCLICommandValidator", () => {
  const commands: CLICommand[] = [
    makeCmd({ name: "open", summary: "Open URL" }),
    makeCmd({
      name: "price",
      summary: "Price",
      inputSchema: z.object({
        timeframe: z.string().optional().describe("TF"),
        json: z.boolean().optional().describe("JSON"),
      }),
    }),
  ];

  test("returns a validator function", () => {
    const validate = buildCLICommandValidator(commands);
    expect(typeof validate).toBe("function");
  });

  test("validates args for a known command", () => {
    const validate = buildCLICommandValidator(commands);
    const { data, warnings } = validate("price", ["--timeframe", "1h"]);
    expect(data.timeframe).toBe("1h");
    expect(warnings).toEqual([]);
  });

  test("passes through global flags for unknown command", () => {
    const validate = buildCLICommandValidator(commands);
    const result = validate("nonexistent", ["--help"]);
    expect(result.warnings).toEqual([]);
  });

  test("rejects unknown flags for known command", () => {
    const validate = buildCLICommandValidator(commands);
    const { warnings } = validate("price", ["--timefram"]);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

// ── createFlatCommandSchema ─────────────────────────────────────────

describe("createFlatCommandSchema", () => {
  test("empty commands → command field is z.string, no extra fields", () => {
    const schema = createFlatCommandSchema([]);
    expect(schema.shape.command).toBeInstanceOf(z.ZodString);
    expect(Object.keys(schema.shape)).toEqual(["command"]);
  });

  test("single command → command field is z.literal", () => {
    const cmd = makeCmd({
      name: "open",
      summary: "Open URL",
      inputSchema: z.object({ url: z.string().describe("Target URL") }),
    });
    const schema = createFlatCommandSchema([cmd]);
    const cmdField = schema.shape.command!;
    expect(cmdField).toBeInstanceOf(z.ZodLiteral);
    expect(cmdField.parse("open")).toBe("open");
    expect(() => cmdField.parse("other")).toThrow();
  });

  test("multiple commands → command field is z.enum", () => {
    const cmd1 = makeCmd({
      name: "foo",
      summary: "Foo",
      inputSchema: z.object({ x: z.string().optional() }),
    });
    const cmd2 = makeCmd({
      name: "bar",
      summary: "Bar",
      inputSchema: z.object({ y: z.string().optional() }),
    });
    const schema = createFlatCommandSchema([cmd1, cmd2]);
    expect(schema.shape.command).toBeInstanceOf(z.ZodEnum);
    expect(schema.shape.command!.parse("foo")).toBe("foo");
    expect(schema.shape.command!.parse("bar")).toBe("bar");
    expect(() => schema.shape.command!.parse("baz")).toThrow();
  });

  test("all merged fields are optional regardless of original required-ness", () => {
    const cmd = makeCmd({
      name: "required-field",
      summary: "Required",
      inputSchema: z.object({ name: z.string() }), // required in its own schema
    });
    const schema = createFlatCommandSchema([cmd]);
    const nameField = schema.shape.name as z.ZodTypeAny;
    expect(nameField).toBeInstanceOf(z.ZodOptional);
    // Should parse successfully with no name provided
    expect(schema.parse({ command: "required-field" })).toEqual({ command: "required-field" });
  });

  test("already-optional fields are not double-wrapped", () => {
    const cmd = makeCmd({
      name: "opt",
      summary: "Opt",
      inputSchema: z.object({ tag: z.string().optional() }), // already optional
    });
    const schema = createFlatCommandSchema([cmd]);
    const tagField = schema.shape.tag as z.ZodOptional<z.ZodString>;
    // Should be ZodOptional<ZodString>, NOT ZodOptional<ZodOptional<ZodString>>
    expect(tagField).toBeInstanceOf(z.ZodOptional);
    expect(tagField._def.innerType).toBeInstanceOf(z.ZodString);
  });

  test("commands without ZodObject inputSchema are skipped gracefully", () => {
    const withSchema = makeCmd({
      name: "typed",
      summary: "Typed",
      inputSchema: z.object({ verbose: z.boolean().optional() }),
    });
    const noSchema = makeCmd({
      name: "bare",
      summary: "Bare",
      // no inputSchema
    });
    const schema = createFlatCommandSchema([withSchema, noSchema]);
    expect(schema.shape).toHaveProperty("verbose");
    expect(schema.shape).toHaveProperty("command");
    // bare command contributes no extra fields
    expect(Object.keys(schema.shape).length).toBe(2); // command + verbose
  });

  test("same-named fields from different commands: last registration wins", () => {
    const cmd1 = makeCmd({
      name: "a",
      summary: "A",
      inputSchema: z.object({ shared: z.string().describe("From A") }),
    });
    const cmd2 = makeCmd({
      name: "b",
      summary: "B",
      inputSchema: z.object({ shared: z.coerce.number().describe("From B") }),
    });
    const schema = createFlatCommandSchema([cmd1, cmd2]);
    const sharedField = schema.shape.shared as z.ZodTypeAny;
    // cmd2's z.coerce.number() should have overwritten cmd1's z.string
    expect(sharedField.safeParse("42").success).toBe(true);
    expect(sharedField.parse("42")).toBe(42);
  });

  test("command field has the expected description", () => {
    const schema = createFlatCommandSchema([
      makeCmd({ name: "x", summary: "X", inputSchema: z.object({}) }),
    ]);
    expect(schema.shape.command!.description).toBe("Which command in the bundle to run");
  });

  test("integration: parseCliArgs works end-to-end with a flattened schema", () => {
    const cmd1 = makeCmd({
      name: "serve",
      summary: "Serve",
      inputSchema: z.object({
        port: z.coerce.number().optional().describe("Port"),
        host: z.string().optional().describe("Host"),
      }),
    });
    const cmd2 = makeCmd({
      name: "build",
      summary: "Build",
      inputSchema: z.object({
        outdir: z.string().optional().describe("Output dir"),
      }),
    });
    const flat = createFlatCommandSchema([cmd1, cmd2]);
    const { data, warnings } = parseCliArgs(flat, ["--command", "serve", "--port", "3000"]);
    expect(data.command).toBe("serve");
    expect(data.port).toBe(3000);
    expect(warnings).toEqual([]);
  });

  test("positional command name works via parseCliArgs with positionalKeys", () => {
    const cmd = makeCmd({
      name: "deploy",
      summary: "Deploy",
      inputSchema: z.object({
        target: z.string().optional().describe("Target env"),
      }),
    });
    const flat = createFlatCommandSchema([cmd]);
    const { data, warnings } = parseCliArgs(flat, ["deploy", "--target", "prod"], ["command"]);
    expect(data.command).toBe("deploy");
    expect(data.target).toBe("prod");
    expect(warnings).toEqual([]);
  });

  test("commands with undefined name are filtered from enum", () => {
    const named = makeCmd({
      name: "real",
      summary: "Real",
      inputSchema: z.object({ a: z.string().optional() }),
    });
    const unnamed = makeCmd({
      name: undefined as unknown as string,
      summary: "Ghost",
      inputSchema: z.object({ b: z.string().optional() }),
    });
    const schema = createFlatCommandSchema([named, unnamed]);
    // unnamed command's inputSchema fields still merge (b is present)
    expect(schema.shape).toHaveProperty("b");
    // but only the named command appears in the enum
    expect(schema.shape.command!.parse("real")).toBe("real");
    expect(() => schema.shape.command!.parse("ghost")).toThrow();
  });

  test("command whose inputSchema contains a 'command' field does not shadow the bundle selector", () => {
    const cmd = makeCmd({
      name: "evil",
      summary: "Evil",
      inputSchema: z.object({
        command: z.string().describe("user's evil field"),
        payload: z.string().optional(),
      }),
    });
    const schema = createFlatCommandSchema([cmd]);
    // The bundle selector should be a z.literal("evil"), not z.string
    expect(schema.shape.command).toBeInstanceOf(z.ZodLiteral);
    expect(schema.shape.command!.parse("evil")).toBe("evil");
    expect(() => schema.shape.command!.parse("anything")).toThrow();
    // payload merged normally
    expect(schema.shape).toHaveProperty("payload");
  });

  test("commands with non-ZodObject inputSchema (e.g. z.array) do not crash", () => {
    const arraySchema = makeCmd({
      name: "list",
      summary: "List",
      inputSchema: z.array(z.string()),
    });
    const objSchema = makeCmd({
      name: "get",
      summary: "Get",
      inputSchema: z.object({ id: z.string().optional() }),
    });
    // Should not throw — array schema is skipped
    const schema = createFlatCommandSchema([arraySchema, objSchema]);
    expect(schema.shape).toHaveProperty("id");
    expect(schema.shape.command).toBeInstanceOf(z.ZodEnum);
  });

  test("command with name but no inputSchema still appears in enum", () => {
    const bare = makeCmd({ name: "noop", summary: "Noop" });
    const schema = createFlatCommandSchema([bare]);
    expect(schema.shape.command).toBeInstanceOf(z.ZodLiteral);
    expect(schema.shape.command!.parse("noop")).toBe("noop");
    // Only the command field exists
    expect(Object.keys(schema.shape)).toEqual(["command"]);
  });

  test("single-command z.string accepts any value (no validation on command field)", () => {
    const schema = createFlatCommandSchema([]);
    expect(schema.parse({ command: "anything" })).toEqual({ command: "anything" });
    expect(schema.parse({ command: "" })).toEqual({ command: "" });
  });
});
