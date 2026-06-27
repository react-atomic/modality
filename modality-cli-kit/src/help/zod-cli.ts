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
import type { Option, Subcommand } from "./types";
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

  // Unwrap Optional/Default/Nullable wrappers via Zod's public API.
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
 */
export function inferOptionType(option: Option): z.ZodTypeAny {
  if (option.flag.startsWith("--no-")) return z.boolean().default(true);
  if (option.arg) return z.string().optional();
  return z.boolean().optional();
}

/**
 * Convert an array of Option definitions into a Zod object schema.
 *
 * Keys are derived from the long flag name (e.g., `"--timeframe"` → `"timeframe"`).
 * Short flags (`-h`) are skipped since they're typically aliases handled elsewhere.
 */
export function optionsToSchema(
  options: Option[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const opt of options) {
    const match = opt.flag.match(/^--([\w-]+)/);
    if (!match) continue;
    shape[match[1]!] = inferOptionType(opt);
  }
  return z.object(shape);
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
 * @returns An object with `data` (the typed parsed output) and `warnings`.
 *          On schema validation failure, partial data is still returned alongside
 *          structured warning messages.
 */
export function parseCliArgs<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  args: string[],
): {
  data: z.output<z.ZodObject<T>>;
  warnings: string[];
} {
  const parsed: Record<string, unknown> = {};
  const warnings: string[] = [];
  const shapeKeys = new Set(Object.keys(schema.shape));
  let ended = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;

    if (a === "--") {
      ended = true;
      continue;
    }
    if (ended) continue;

    // Positional args are ignored by flag parser
    if (!a.startsWith("-")) continue;

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

    // --<flag>[=<value>] or --<flag> <value>
    const eqIdx = a.indexOf("=");
    let key: string;
    let value: string | undefined;

    if (eqIdx !== -1) {
      key = a.slice(2, eqIdx);
      value = a.slice(eqIdx + 1);
    } else {
      key = a.slice(2);
    }

    if (!shapeKeys.has(key)) {
      const suggestion = fuzzySuggestion(key, [...shapeKeys]);
      warnings.push(
        `Unknown flag --${key}${suggestion ? `. Did you mean --${suggestion}?` : ""}`,
      );
      continue;
    }

    // Determine if the schema expects a boolean
    const fieldSchema = schema.shape[key]! as z.ZodTypeAny;
    const isBoolean = isBooleanSchema(fieldSchema);

    if (isBoolean) {
      parsed[key] = true;
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

  // Validate the parsed object through the Zod schema
  const result = schema.safeParse(parsed);

  if (!result.success) {
    for (const issue of result.error.issues) {
      warnings.push(`${issue.path.join(".")}: ${issue.message}`);
    }
  }

  return {
    data: (result.success ? result.data : parsed) as z.output<z.ZodObject<T>>,
    warnings,
  };
}

// ── Schema helpers ──────────────────────────────────────────────────

/**
 * Merge global default flags (--help, --json, --no-cache) into a Zod schema
 * so they are recognized as valid flags instead of flagged as unknown.
 *
 * Short flags (-h) are skipped since they're aliases handled elsewhere.
 */
function mergeDefaultFlags(
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>,
  extraFlags?: string[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const merged = { ...schema.shape };
  const flags = extraFlags ?? [...DEFAULT_GLOBAL_FLAGS];

  for (const flag of flags) {
    if (!flag.startsWith("--")) continue; // skip short flags like -h
    const key = flag.slice(2);
    if (!(key in merged)) {
      merged[key] = z.boolean().optional();
    }
  }

  return z.object(merged);
}

// ── Subcommand-level validation ─────────────────────────────────────

/**
 * Convert a Subcommand definition's options into a Zod schema and validate CLI args.
 *
 * Uses `optionsToSchema` to infer the schema from the subcommand's `options` array.
 * Global default flags (--help, --json, --no-cache) are automatically included.
 * Returns both the typed parsed data and any validation warnings.
 *
 * @example
 * ```ts
 * const result = validateSubcommandArgs(subcommand, ["--timeframe", "5m"]);
 * // result.data → { timeframe: "5m" }
 * ```
 */
export function validateSubcommandArgs(
  subcommand: Subcommand | null | undefined,
  args: string[],
  extraFlags?: string[],
): {
  data: Record<string, unknown>;
  warnings: string[];
} {
  const schema = mergeDefaultFlags(
    optionsToSchema(subcommand?.options ?? []),
    extraFlags,
  );
  return parseCliArgs(schema, args);
}

/**
 * Build a Zod-powered args validator for a full CLI with many subcommands.
 *
 * Each subcommand's options are converted to a Zod schema and used to validate
 * raw CLI argument tokens. Unknown subcommand names fall through to the
 * top-level (empty validation).
 *
 * ```ts
 * const validate = buildSubcommandValidator(subcommands);
 * const result = validate("price", ["--timeframe", "5m"]);
 * // result.data → { timeframe: "5m" }
 * ```
 */
export function buildSubcommandValidator(
  subcommands: Subcommand[],
  extraFlags?: string[],
): (
  name: string,
  args: string[],
) => { data: Record<string, unknown>; warnings: string[] } {
  const map = new Map(subcommands.map((sc) => [sc.name, sc]));

  return (name: string, args: string[]) => {
    return validateSubcommandArgs(map.get(name) ?? null, args, extraFlags);
  };
}
