/**
 * Zod-powered CLI argument validation.
 *
 * Infers Zod schemas from CLI option definitions and parses raw argv tokens
 * into typed, validated data. Provides structured error messages with fuzzy
 * "Did you mean?" suggestions.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import { parseCliArgs } from "./zod-cli";
 *
 * const schema = z.object({
 *   config: z.string().optional(),
 *   verbose: z.boolean().optional(),
 *   count: z.coerce.number().optional(),
 * });
 *
 * const { data, warnings } = parseCliArgs(schema, ["--config", "dev", "--verbose"]);
 * // data → { config: "dev", verbose: true }
 * // warnings → []
 * ```
 */

import { z } from "zod";
import type { Option, CLICommand, KeyOverride } from "./types";
import { fuzzySuggestion, DEFAULT_GLOBAL_FLAGS } from "./validator";

// ── Schema introspection helpers ─────────────────────────────────────

/**
 * Check if a Zod schema is ultimately a boolean type, unwrapping
 * Optional, Default, and Nullable wrappers.
 *
 * Uses Zod's `instanceof` check at the leaf level and the public `.unwrap()`
 * method to peel wrapper types one layer at a time. Leaf schemas don't expose
 * `.unwrap()`, which terminates the recursion.
 */
function isBooleanSchema(schema: z.ZodTypeAny): boolean {
  if (schema instanceof z.ZodBoolean) return true;

  const unwrap = (schema as { unwrap?: () => z.ZodTypeAny }).unwrap;
  if (typeof unwrap === "function") return isBooleanSchema(unwrap.call(schema));

  return false;
}

// ── Zod schema inference from Option definitions ──────────────────────

/**
 * Infer a Zod type from an Option's structure.
 *
 * - Options with an `arg` placeholder → `z.string()` (takes a value)
 * - Options without `arg` → `z.boolean()` (on/off flag)
 * - Options beginning with `--no-` → `z.boolean().default(true)` (opt-out flag)
 * - Options with `type: "number"` → `z.coerce.number()`
 * - Options with `type: "enum"` → `z.enum(enumValues!)`
 * - Options with `required: true` → no `.optional()` wrapper
 */
export function inferOptionType(option: Option): z.ZodTypeAny {
  if (option.flag.startsWith("--no-")) return z.boolean().default(true);

  const build = (): z.ZodTypeAny => {
    switch (option.type) {
      case "number":
        return z.coerce.number();
      case "enum":
        if (!option.enumValues || option.enumValues.length === 0) {
          return z.string();
        }
        if (option.enumValues.length === 1) {
          // z.enum() requires at least 2 elements; singleton becomes a string with a literal suggestion
          return z.literal(option.enumValues[0]);
        }
        return z.enum(option.enumValues as [string, ...string[]]);
      case "boolean":
        return z.boolean();
      case "string":
        return z.string();
      default:
        return option.arg ? z.string() : z.boolean();
    }
  };

  const base = build();
  return option.required ? base : base.optional();
}

// ── CLI arg parsing ──────────────────────────────────────────────────

/**
 * Parse raw CLI argument tokens against a Zod object schema.
 *
 * Convention:
 * - `--key value` → sets `key` to `value` (for string/number schemas)
 * - `--key` → sets `key` to `true` (for boolean/coercible schemas)
 * - `--no-key` → sets `key` to `false`
 * - `--key=value` → inline value (works for all types)
 * - `--` terminator: args after `--` are ignored
 *
 * Unknown flags that don't match the schema produce fuzzy "Did you mean?" warnings.
 * After parsing raw tokens into a plain object, the object is validated through
 * the Zod schema, catching type mismatches, missing required fields, etc.
 *
 * Positional (non-flag) tokens are collected in order. If `positionalKeys` is
 * supplied, each positional is assigned to the corresponding key *before*
 * validation, so positionals receive the same coercion/enum/required checks as
 * flags. The full ordered list is also returned as `positionals`.
 *
 * @returns An object with `data` (the typed parsed output), `warnings`, and the
 *          ordered `positionals` tokens. On schema validation failure, partial
 *          data is still returned alongside structured warning messages.
 */
export function parseCliArgs<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  args: string[],
  positionalKeys?: string[],
): {
  data: z.output<z.ZodObject<T>>;
  warnings: string[];
  positionals: string[];
} {
  const parsed: Record<string, unknown> = {};
  const warnings: string[] = [];
  const shapeKeys = new Set(Object.keys(schema.shape));
  const positionals: string[] = [];
  let ended = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;

    if (a === "--") {
      ended = true;
      continue;
    }
    if (ended) {
      positionals.push(a);
      continue;
    }

    // Non-flag tokens are collected as positionals for later mapping
    if (!a.startsWith("-")) {
      positionals.push(a);
      continue;
    }

    // --no-<flag> negation
    if (a.startsWith("--no-")) {
      const rest = a.slice(5);
      const noKey = "no-" + rest;
      // Prefer matching the full key (e.g., --no-cache → "no-cache")
      // then fall back to stripping the prefix (e.g., --no-cache → "cache")
      const matchedKey = shapeKeys.has(noKey) ? noKey : shapeKeys.has(rest) ? rest : null;
      if (matchedKey) {
        parsed[matchedKey] = false;
      } else {
        const suggestion = fuzzySuggestion(noKey, [...shapeKeys]) ?? fuzzySuggestion(rest, [...shapeKeys]);
        warnings.push(
          `Unknown flag --no-${rest}${suggestion ? `. Did you mean --no-${suggestion}?` : ""}`,
        );
      }
      continue;
    }

    // --<flag>[=<value>], -<f>[=<value>], or flag followed by a value token
    const eqIdx = a.indexOf("=");
    const raw = eqIdx !== -1 ? a.slice(0, eqIdx) : a;
    const key = raw.startsWith("--") ? raw.slice(2) : raw.slice(1);
    let value: string | undefined =
      eqIdx !== -1 ? a.slice(eqIdx + 1) : undefined;

    if (!shapeKeys.has(key)) {
      const suggestion = fuzzySuggestion(key, [...shapeKeys]);
      warnings.push(
        `Unknown flag ${raw}${suggestion ? `. Did you mean --${suggestion}?` : ""}`,
      );
      continue;
    }

    // Determine if the schema expects a boolean
    const fieldSchema = schema.shape[key]! as z.ZodTypeAny;
    const isBoolean = isBooleanSchema(fieldSchema);

    if (isBoolean) {
      // Inline `--flag=false/0/no/off` disables; bare `--flag` (or any other
      // value) enables. Without this, `--json=false` would wrongly set true.
      parsed[key] = value === undefined ? true : !/^(false|0|no|off)$/i.test(value);
    } else {
      // Consume next arg as value (if not already provided via =)
      if (value === undefined) {
        value = args[++i];
      }
      if (value === undefined) {
        warnings.push(`Flag --${key} requires a value.`);
        continue;
      }
      parsed[key] = value;
    }
  }

  // Map positional tokens onto their keys before validation so they receive
  // the same coercion/enum/required checks as flags.
  if (positionalKeys) {
    for (let p = 0; p < positionalKeys.length && p < positionals.length; p++) {
      const key = positionalKeys[p]!;
      if (parsed[key] === undefined) parsed[key] = positionals[p];
    }
  }

  // Validate the parsed object through the Zod schema
  const result = schema.safeParse(parsed);

  if (!result.success) {
    for (const issue of result.error.issues) {
      // Object-level refinements have an empty path — no "field:" prefix
      const path = issue.path.join(".");
      warnings.push(path ? `${path}: ${issue.message}` : issue.message);
    }
  }

  return {
    data: (result.success ? result.data : parsed) as z.output<z.ZodObject<T>>,
    warnings,
    positionals,
  };
}

// ── Convert camelCase to kebab-case ───────────────────────────────────────

/**
 * Convert camelCase to kebab-case.
 * "userDataDir" → "user-data-dir", "mcpType" → "mcp-type"
 */
export function toKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

// ── Zod field introspection ───────────────────────────────────────────────

interface FieldAnalysis {
  baseType: "string" | "boolean" | "number" | "enum";
  isOptional: boolean;
  enumValues?: string[];
  description?: string;
}

/**
 * Peel `.optional()`, `.default()`, `.nullable()` wrappers and classify the
 * inner Zod type. Returns the base type together with metadata.
 *
 * In Zod 4, `.describe()` sets the description on the outermost wrapper,
 * so `description` is captured from the original field before unwrapping.
 */
function analyzeZodField(field: z.ZodTypeAny): FieldAnalysis {
  let isOptional = false;
  let current: z.ZodTypeAny = field;

  // Capture description from the outer field (Zod 4 puts it on the wrapper)
  const description = (field as { description?: string }).description;

  while (true) {
    if (current instanceof z.ZodOptional) {
      isOptional = true;
      current = current.unwrap() as unknown as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodDefault) {
      isOptional = true; // has default → effectively optional in CLI
      current = current.unwrap() as unknown as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodNullable) {
      current = current.unwrap() as unknown as z.ZodTypeAny;
      continue;
    }
    break;
  }

  // Classify the inner type
  if (current instanceof z.ZodString)
    return { baseType: "string", isOptional, description };
  if (current instanceof z.ZodBoolean)
    return { baseType: "boolean", isOptional, description };
  if (current instanceof z.ZodNumber)
    return { baseType: "number", isOptional, description };
  if (current instanceof z.ZodEnum)
    return {
      baseType: "enum",
      isOptional,
      enumValues: [...current.options].map(String),
      description,
    };

  // Fallback for unrecognised types
  return { baseType: "string", isOptional, description: description ?? "(unknown type)" };
}

// ── Reverse: Zod → Option[] ───────────────────────────────────────────────

/**
 * Walk a ZodObject's `.shape` fields and produce an `Option[]` suitable for
 * help text display and CLI flag validation.
 *
 * Conventions used for the conversion:
 *
 *   Schema field type        →  Option.type
 *   -----------------------     ------------
 *   z.string()                →  "string" (takes a value)
 *   z.boolean()               →  "boolean" (on/off flag)
 *   z.coerce.number()         →  "number"
 *   z.enum([...])             →  "enum" + enumValues
 *
 * Wrapper handling: `.optional()`, `.default()`, `.nullable()` are unwrapped
 * to reach the base type.  `required` is set to `true` only when the field
 * has NO optional wrapper.
 *
 * Field `.describe()` strings are used as the option description.
 * Single-character keys produce short flags (`-h`); all others produce
 * long flags (`--kebab-case`).
 *
 * @param schema       The Zod object schema to walk.
 * @param keyMap       Optional key → CLI flag metadata overrides.
 *                     Use `{ position: N }` to make a field a positional arg.
 * @returns An object with `options` (flag-style) and `positionals` (ordered).
 */
export function schemaToCliOptions(
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>,
  keyMap?: Record<string, KeyOverride>,
): { options: Option[]; positionals: Option[] } {
  const options: Option[] = [];
  const positionals: { opt: Option; key: string; index: number }[] = [];

  for (const [key, rawField] of Object.entries(schema.shape)) {
    const override = keyMap?.[key];

    // Skip hidden fields entirely
    if (override?.hidden) continue;

    const { baseType, isOptional, enumValues, description } =
      analyzeZodField(rawField as z.ZodTypeAny);

    const flag =
      override?.flag ?? (key.length === 1 ? `-${key}` : `--${toKebab(key)}`);

    const opt: Option = {
      flag,
      arg:
        baseType === "boolean"
          ? undefined
          : override?.arg ?? `<${toKebab(key)}>`,
      desc: description ?? "",
      type: baseType as Option["type"],
      required: !isOptional,
    };
    if (baseType === "enum" && enumValues) {
      opt.enumValues = enumValues;
    }

    if (override?.position !== undefined) {
      // Positional entries use bare names (no -- prefix)
      if (opt.flag.startsWith("--")) opt.flag = opt.flag.slice(2);
      positionals.push({ opt, key, index: override.position });
    } else {
      options.push(opt);
    }
  }

  // Return positionals in declaration order
  positionals.sort((a, b) => a.index - b.index);
  return {
    options,
    positionals: positionals.map((p) => p.opt),
  };
}

/**
 * Merge positional keys, per-field keyMap, and skipped fields into a single
 * keyMap suitable for `schemaToCliOptions()`.
 *
 * @param positionalKeys  Schema keys that map to positional args (in order).
 * @param keyMap          Explicit per-field overrides.
 * @param skipFields      Schema keys to hide from CLI generation entirely.
 */
export function buildKeyMap(
  positionalKeys: string[] | undefined,
  keyMap: Record<string, KeyOverride> | undefined,
  skipFields?: string[],
): Record<string, KeyOverride> | undefined {
  const km: Record<string, KeyOverride> = {};

  // Mark globally skipped fields as hidden
  if (skipFields) {
    for (const key of skipFields) {
      km[key] = { ...km[key], hidden: true };
    }
  }

  // Copy explicit keyMap entries
  if (keyMap) {
    for (const [k, v] of Object.entries(keyMap)) {
      km[k] = { ...km[k], ...v };
    }
  }

  // Annotate positional keys with their index
  if (positionalKeys) {
    for (let i = 0; i < positionalKeys.length; i++) {
      const key = positionalKeys[i]!;
      km[key] = { ...km[key], position: i };
    }
  }

  return Object.keys(km).length > 0 ? km : undefined;
}

// ── Schema helpers ──────────────────────────────────────────────────

/**
 * Merge global default flags (--help, --json, --no-cache) plus any
 * `extraFlags` into a Zod schema so they are recognized as valid flags
 * instead of flagged as unknown. Extra flags add to the defaults — matching
 * `knownFlags()` — they do not replace them.
 *
 * Uses `.safeExtend()` so object-level refinements (e.g. "--stop and --target
 * must be provided together") survive the merge — rebuilding via `z.object()`
 * would silently drop them.
 *
 * Short flags (-h) are skipped since they're aliases handled elsewhere.
 */
function mergeDefaultFlags(
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>,
  extraFlags?: string[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const extra: Record<string, z.ZodTypeAny> = {};
  const flags = [...DEFAULT_GLOBAL_FLAGS, ...(extraFlags ?? [])];

  for (const flag of flags) {
    if (!flag.startsWith("--")) continue; // skip short flags like -h
    const key = flag.slice(2);
    if (!(key in schema.shape)) {
      extra[key] = z.boolean().optional();
    }
  }

  if (Object.keys(extra).length === 0) return schema;
  return schema.safeExtend(extra);
}

// ── CLICommand-level validation ─────────────────────────────────────

/**
 * Normalize a ZodObject's shape keys from camelCase to kebab-case so they
 * match how CLI flag arguments are parsed (e.g. `--user-data-dir` maps to
 * schema key `user-data-dir`, not `userDataDir`).
 *
 * Fields marked as `hidden` in `keyMap` are excluded from the returned schema
 * so that hidden/skipped fields don't trigger validation failures for inputs
 * that the user cannot supply via the CLI.
 *
 * Caveat: when keys are renamed or removed, the object must be rebuilt and
 * object-level refinements are lost (their callbacks reference the original
 * key names, so they cannot be carried over safely). Schemas whose keys are
 * already kebab-case and have no hidden fields pass through untouched,
 * refinements included.
 */
export function normalizeSchemaKeys(
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>,
  keyMap?: Record<string, KeyOverride>,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape = schema.shape;
  const normalized: Record<string, z.ZodTypeAny> = {};
  let changed = false;
  let removed = false;
  for (const [key, field] of Object.entries(shape)) {
    // Exclude hidden fields — they cannot be supplied via CLI flags
    if (keyMap?.[key]?.hidden) { removed = true; continue; }
    const kebab = toKebab(key);
    normalized[kebab] = field;
    if (kebab !== key) changed = true;
  }
  // Must create a new ZodObject when keys were removed OR renamed
  return (changed || removed) ? z.object(normalized) : schema;
}

/**
 * Validate CLI args against a CLICommand's Zod `inputSchema`.
 *
 * When `command.inputSchema` is set on a ZodObject, it is used directly for
 * validation (with keys normalized from camelCase to kebab-case).  Commands
 * without a schema only accept their `positionals` plus the global default
 * flags (--help, --json, --no-cache), which are automatically included.
 * Returns both the typed parsed data and any validation warnings.
 *
 * @example
 * ```ts
 * const result = validateCLICommandArgs(command, ["--timeframe", "5m"]);
 * // result.data → { timeframe: "5m" }
 * ```
 */
export function validateCLICommandArgs(
  command: CLICommand | null | undefined,
  args: string[],
  extraFlags?: string[],
): {
  data: Record<string, unknown>;
  warnings: string[];
} {
  const positionals = command?.positionals ?? [];
  // Positional keys come from materialized `positionals` entries when present,
  // else from `positionalKeys` (kebab-ized to match the normalized schema) so
  // schema-only commands don't need pre-materialized positional Options.
  const positionalKeys = positionals.length > 0
    ? positionals.map((pos) => pos.flag)
    : (command?.positionalKeys ?? []).map(toKebab);
  let schema: z.ZodObject<Record<string, z.ZodTypeAny>>;

  // Use inputSchema directly for validation when available (bypasses a lossy
  // Option[]→schema reconstruction, preserving refinements and
  // transforms). Keys are normalized to kebab-case so CLI flag tokens like
  // "--user-data-dir" map to the correct shape key.  Hidden fields (from
  // keyMap) are excluded so they don't cause false validation failures.
  if (command?.inputSchema instanceof z.ZodObject) {
    schema = normalizeSchemaKeys(
      command.inputSchema as z.ZodObject<Record<string, z.ZodTypeAny>>,
      command.keyMap,
    );
  } else {
    // No schema → only positionals are recognized. Positionals always carry a
    // value, so default to a string when no explicit `type` is given (the
    // boolean-flag default only makes sense for options).
    const posShape: Record<string, z.ZodTypeAny> = {};
    for (const pos of positionals) {
      posShape[pos.flag] = inferOptionType({
        ...pos,
        arg: pos.arg ?? `<${pos.flag}>`,
      });
    }
    schema = z.object(posShape);
  }

  return parseCliArgs(
    mergeDefaultFlags(schema, extraFlags),
    args,
    positionalKeys,
  );
}

/**
 * Build a Zod-powered args validator for a full CLI with many commands.
 *
 * Each command's options are converted to a Zod schema and used to validate
 * raw CLI argument tokens. Unknown command names fall through to the
 * top-level (empty validation).
 *
 * ```ts
 * const validate = buildCLICommandValidator(commands);
 * const result = validate("price", ["--timeframe", "5m"]);
 * // result.data → { timeframe: "5m" }
 * ```
 */
export function buildCLICommandValidator(
  commands: CLICommand[],
  extraFlags?: string[],
): (
  name: string,
  args: string[],
) => { data: Record<string, unknown>; warnings: string[] } {
  const map = new Map(commands.map((cmd) => [cmd.name, cmd]));

  return (name: string, args: string[]) => {
    return validateCLICommandArgs(map.get(name) ?? null, args, extraFlags);
  };
}

/**
 * Flatten a set of commands into a single Zod object schema addressing the
 * whole bundle: a `command` field naming which command to run, plus every
 * command's `inputSchema` fields merged at the top level.
 *
 * A caller invokes the bundle by naming one command and supplying that
 * command's args — as a positional (`bundle foo --target x`) or as a flag
 * (`bundle --command foo --target x`); `command` is a normal enum field, so
 * both forms parse through {@link parseCliArgs}. The positional form
 * requires passing `positionalKeys: ["command"]` to `parseCliArgs`.
 *
 * Because the flattened args span many commands but only the selected
 * command's args apply on any one call, **every merged arg is relaxed to
 * `.optional()`** — the schema is a permissive superset. Each command's true
 * required-ness is still enforced downstream by {@link validateCLICommandArgs}
 * against that command's own `inputSchema`. Same-named fields from different
 * commands collapse to one (last registration wins).
 *
 * The `command` field mirrors {@link inferOptionType}'s enum convention:
 * ≥2 names → `z.enum`, exactly 1 → `z.literal`, none → `z.string`.
 *
 * ```ts
 * const SkillSchema = createFlatCommandSchema(registry.all);
 * // → z.object({ command: z.enum(["foo","bar"]), target: z.string().optional() })
 * ```
 */
export function createFlatCommandSchema(
  commands: CLICommand[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const names = commands
    .map((cmd) => cmd.name)
    .filter((name): name is string => !!name);

  const args: Record<string, z.ZodTypeAny> = {};
  for (const cmd of commands) {
    if (!(cmd.inputSchema instanceof z.ZodObject)) continue;
    for (const [key, field] of Object.entries(cmd.inputSchema.shape)) {
      const f = field as z.ZodTypeAny;
      // Avoid double-wrapping: only wrap if not already optional.
      args[key] = f instanceof z.ZodOptional ? f : f.optional();
    }
  }

  const command =
    names.length >= 2
      ? z.enum(names as [string, ...string[]])
      : names.length === 1
        ? z.literal(names[0]!)
        : z.string();

  // Spread the flattened args first so the `command` selector is set last and
  // always wins — a command whose own inputSchema has a field named "command"
  // cannot shadow the bundle selector.
  return z.object({
    ...args,
    command: command.describe("Which command in the bundle to run"),
  });
}
