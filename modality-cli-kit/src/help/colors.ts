/**
 * Bun-style ANSI color helpers for CLI output.
 *
 * - Auto-detects TTY (dims/colors suppressed when piped or NO_COLOR set)
 * - Semantic wrappers for consistent CLI documentation style
 * - Raw escape codes also exported for custom usage
 */

// ── Raw escape codes ────────────────────────────────────────────────────────

const codes = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  // Foreground
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  // Background
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
} as const;

type ColorName = keyof typeof codes;

// ── TTY / NO_COLOR detection ───────────────────────────────────────────────

let _noColor: boolean | null = null;

function noColor(): boolean {
  if (_noColor !== null) return _noColor;
  _noColor =
    process.env.NO_COLOR !== undefined ||
    !process.stdout.isTTY;
  return _noColor;
}

/** Override color detection (useful in tests). Returns previous value. */
export function setNoColor(v: boolean): boolean {
  const prev = noColor();
  _noColor = v;
  return prev;
}

// ── Color application ──────────────────────────────────────────────────────

function wrap(code: string, text: string): string {
  if (noColor()) return text;
  return `${code}${text}${codes.reset}`;
}

/** Apply a raw color/style by name. */
export function color(name: ColorName, text: string): string {
  return wrap(codes[name], text);
}

// ── Semantic CLI style helpers (bun convention) ────────────────────────────

/** Cyan bold — for command names (e.g. `co-chrome open`) */
export const cmd = (text: string): string => wrap(codes.bold + codes.cyan, text);

/** Yellow bold — for section headers (Usage:, Options:, Examples:) */
export const header = (text: string): string =>
  wrap(codes.bold + codes.yellow, text);

/** Green — for option flags (--config, --json) */
export const opt = (text: string): string => wrap(codes.green, text);

/** Blue — for argument placeholders (<file>, <url>) */
export const arg = (text: string): string => wrap(codes.blue, text);

/** Magenta — for example values / sample commands */
export const example = (text: string): string => wrap(codes.magenta, text);

/** Gray dim — for descriptions, secondary text */
export const dim = (text: string): string => wrap(codes.dim + codes.gray, text);

/** Bold — for emphasis (CLI name, headings) */
export const bold = (text: string): string => wrap(codes.bold, text);

/** Red — for error messages */
export const error = (text: string): string => wrap(codes.red, text);

/** Green bold — for success messages */
export const success = (text: string): string =>
  wrap(codes.bold + codes.green, text);

/** Gray italic — for tonal notes */
export const note = (text: string): string => wrap(codes.italic + codes.gray, text);

/** Underline — for links or emphasis */
export const link = (text: string): string => wrap(codes.underline + codes.cyan, text);
