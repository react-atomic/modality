/**
 * CLI flag validation toolkit.
 *
 * Provides fuzzy-matching unknown-flag detection so users get
 * "Unknown flag --confg. Did you mean --config?" instead of silent failure.
 */

import type { Subcommand, Option } from "./types";

// ── Levenshtein distance ───────────────────────────────────────────────────

/**
 * Compute Levenshtein edit distance between two strings.
 * Used for fuzzy flag matching.
 */
export function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  // Use two-row technique for O(n) space
  let prev = new Uint32Array(bn + 1);
  let curr = new Uint32Array(bn + 1);

  for (let j = 0; j <= bn; j++) prev[j] = j;

  for (let i = 1; i <= an; i++) {
    curr[0] = i;
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1]! + 1,     // insertion
        prev[j]! + 1,         // deletion
        prev[j - 1]! + cost,  // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[bn]!;
}

// ── Fuzzy suggestion helper ─────────────────────────────────────────

/**
 * Find the closest fuzzy match for an unknown input within a set of candidates.
 * Returns `null` when no candidate is close enough.
 *
 * Used for "Unknown flag --confg. Did you mean --config?" suggestions.
 */
export function fuzzySuggestion(input: string, candidates: string[]): string | null {
  let bestDist = Infinity;
  let best = "";
  const maxDist = Math.min(3, Math.floor(input.length / 2));

  for (const c of candidates) {
    const d = levenshtein(input, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }

  return bestDist <= maxDist ? best : null;
}

// ── Default global flags ────────────────────────────────────────────────

/** Global flags accepted by all subcommands unless overridden. */
export const DEFAULT_GLOBAL_FLAGS = new Set(["--help", "-h", "--json", "--no-cache"]);

// ── Known-flag extraction ─────────────────────────────────────────────────

/**
 * Extract the set of known flags for a subcommand.
 *
 * @param subcommand  The subcommand descriptor (or `null`/`undefined` for top-level)
 * @param extraFlags  Additional global flags beyond the defaults
 * @returns           Array of flag strings (e.g. `["--help", "-h", "--config", "--json"]`)
 */
export function knownFlags(
  subcommand: Subcommand | null | undefined,
  extraFlags?: string[],
): string[] {
  const flags = new Set(DEFAULT_GLOBAL_FLAGS);
  if (extraFlags) for (const f of extraFlags) flags.add(f);

  if (subcommand) {
    for (const option of subcommand.options ?? []) {
      const tokens = option.flag.match(/--[\w][\w-]*/g);
      if (tokens) for (const t of tokens) flags.add(t);
      // Also add bare positional flags (e.g. "list", "show <id>")
      // These don't start with --, so we handle them separately
      const firstToken = option.flag.split(" ")[0]!;
      if (!firstToken.startsWith("-")) {
        flags.add(firstToken);
      }
    }
  }

  return [...flags];
}

// ── Unknown-flag rejection ─────────────────────────────────────────────────

/**
 * Validate CLI args against known flags for a subcommand.
 * Returns human-readable warning lines for any unknown flags.
 *
 * A `--` token ends flag processing (args after `--` are positional).
 *
 * @param subcommand  The subcommand descriptor (or `null`/`undefined` for top-level)
 * @param args        The raw argument tokens to validate
 * @param extraFlags  Additional global flags (e.g. "--format")
 * @returns           Array of warning strings (empty = no issues)
 */
export function rejectUnknownFlags(
  subcommand: Subcommand | null | undefined,
  args: string[],
  extraFlags?: string[],
): string[] {
  const known = knownFlags(subcommand, extraFlags);
  const warnings: string[] = [];

  let ended = false;
  for (const a of args) {
    if (a === "--") {
      ended = true;
      continue;
    }
    if (ended) continue;

    const isLong = a.startsWith("--");
    if (!a.startsWith("-")) continue;
    if (known.includes(a)) continue;

    // Single-dash shorthand (e.g. -j for --json)
    if (!isLong) {
      warnings.push(
        `Unknown flag ${a}. Use --help to see available options (short flags not supported).`,
      );
      continue;
    }

    // Long flag: try fuzzy match
    const longKnown = known.filter((k) => k.startsWith("--"));
    const match = fuzzySuggestion(a, longKnown);
    const suffix = match ? `. Did you mean ${match}?` : "";
    warnings.push(`Unknown flag ${a}${suffix}`);
  }

  return warnings;
}

// ── Convenience: build the CLI-level rejection dispatcher ──────────────────

type SubcommandMap = Record<string, Subcommand>;

/**
 * Create a flag-rejection function for a full CLI with many subcommands.
 *
 * ```ts
 * const reject = buildFlagRejector(subcommands);
 * const warnings = reject("price", process.argv.slice(3));
 * ```
 */
export function buildFlagRejector(
  subcommands: Subcommand[],
  extraFlags?: string[],
): (name: string, args: string[]) => string[] {
  const map: SubcommandMap = {};
  for (const sc of subcommands) map[sc.name] = sc;

  return (name: string, args: string[]): string[] => {
    return rejectUnknownFlags(map[name] ?? null, args, extraFlags);
  };
}
