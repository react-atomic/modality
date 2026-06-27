/**
 * CLI help text generator — composable, reusable across CLIs.
 *
 * Two output modes:
 *   1. **Global help** (`generateHelp`) — lists all subcommands with one-liners
 *   2. **Per-command help** (`generateCommandHelp`) — detailed flags, usage, examples
 */

import * as c from "./colors";
import { padName, padVisible, flagPad, visibleWidth, Lines } from "./formatter";
import type { Subcommand, HelpConfig, Option } from "./types";

// ── Option rendering ───────────────────────────────────────────────────────

/**
 * Render a single option line for the detailed view.
 *
 *   --config <file>          Path to configuration file
 */
function renderOption(opt: Option, compact: boolean): string {
  const flag = `${c.opt(opt.flag)}${opt.arg ? " " + c.arg(opt.arg) : ""}`;
  const flagWidth = opt.flag.length + (opt.arg ? 1 + opt.arg.length : 0);
  const pad = flagPad(flagWidth, compact);
  return `    ${flag}${pad}${c.dim(opt.desc)}`;
}

// ── Subcommand rendering ──────────────────────────────────────────────────

/**
 * Render one subcommand entry for the global help index.
 *
 * Compact mode (used inside the subcommand list):
 *   price              K 線進場價建議
 *   --timeframe <TF>   週期
 *
 * Non-compact renders the options as well:
 *   price              K 線進場價建議
 *     --timeframe <TF>  週期
 *     --lookback <N>    觀察窗
 */
export function renderSubcommand(
  sc: Subcommand,
  colNameWidth: number = 16,
  compact: boolean = true,
): string {
  const nameCol = c.cmd(padName(sc.name, colNameWidth));

  if (compact) {
    // Single-line: name + summary only
    return `  ${nameCol}${c.dim(sc.summary)}`;
  }

  // Non-compact: name + summary + options below
  const lines = new Lines();
  lines.push(`  ${nameCol}${c.dim(sc.summary)}`);
  for (const opt of sc.options ?? []) {
    lines.push(renderOption(opt, false));
  }
  return lines.flush();
}

// ── Global help ────────────────────────────────────────────────────────────

/**
 * Generate the main help page listing all subcommands.
 *
 * ```text
 * co-chrome — Chrome DevTools CLI
 *
 * Usage: co-chrome <command> [options]
 *
 * Subcommands:
 *   open              Navigate to a URL
 *   click             Click on an element
 *   ...
 *
 * Global Options:
 *   --help, -h        Show this help message
 *
 * Examples:
 *   co-chrome open https://example.com
 * ```
 */
export function generateHelp(config: HelpConfig): string {
  const {
    cliName,
    tagline,
    subcommands,
    globalOptions,
    globalExamples,
    footer,
    colNameWidth = 16,
  } = config;

  // Sort if not explicitly kept in order
  const sorted = config.sorted !== false;
  const scs = sorted
    ? [...subcommands].sort((a, b) => a.name.localeCompare(b.name))
    : subcommands;

  const out = new Lines();

  // Header
  out.push("");
  out.push(`${c.bold(cliName)} ${c.dim(`— ${tagline}`)}`);
  out.push("");

  // Usage
  out.push(`${c.header("Usage:")}  ${c.cmd(cliName)} ${c.arg("<command>")} ${c.dim("[options]")}`);
  out.push("");

  // Subcommands
  out.push(`${c.header("Commands:")}`);
  for (const sc of scs) {
    out.push(renderSubcommand(sc, colNameWidth, true));
  }

  // Global options
  if (globalOptions && globalOptions.length > 0) {
    out.push("");
    out.push(`${c.header("Global Options:")}`);
    for (const opt of globalOptions) {
      out.push(renderOption(opt, true));
    }
  }

  // Examples
  if (globalExamples && globalExamples.length > 0) {
    out.push("");
    out.push(`${c.header("Examples:")}`);
    for (const ex of globalExamples) {
      out.push(`  ${c.example(ex)}`);
    }
  }

  // Footer
  if (footer) {
    out.push("");
    out.push(c.dim(footer));
  }

  // Hint
  out.push("");
  out.push(c.dim(`Run `) + c.cmd(`${cliName} <command> --help`) + c.dim(` for more information about a command.`));
  out.push("");

  return out.flush();
}

// ── Command-specific help ──────────────────────────────────────────────────

/**
 * Generate detailed help for a single subcommand.
 *
 * ```text
 * use-stock price — K 線進場價建議
 *
 * Usage:  use-stock price [symbol] [options]
 *
 * Options:
 *   --timeframe <TF>  週期 (default: 1m)
 *   --lookback <N>    觀察窗 (default: 60)
 *   --help, -h        Show this help message
 *
 * Examples:
 *   use-stock price 2330
 *   use-stock price TXF-S --timeframe 15m
 * ```
 *
 * @param cliName       CLI binary name
 * @param subcommand    The subcommand metadata
 * @param globalOptions Optional global options to append to the options list
 */
export function generateCommandHelp(
  cliName: string,
  subcommand: Subcommand,
  globalOptions?: Option[],
): string {
  const out = new Lines();
  out.push("");
  out.push(`${c.bold(`${cliName} ${subcommand.name}`)} ${c.dim(`— ${subcommand.summary}`)}`);
  out.push("");

  // Usage
  if (subcommand.usage && subcommand.usage.length > 0) {
    const [first, ...rest] = subcommand.usage;
    out.push(`${c.header("Usage:")}  ${c.cmd(first!)}`);
    for (const line of rest) out.push(`        ${c.cmd(line)}`);
  } else {
    out.push(`${c.header("Usage:")}  ${c.cmd(cliName)} ${c.cmd(subcommand.name)} ${c.dim("[options]")}`);
  }
  out.push("");

  // Options
  const hasOwnOptions = subcommand.options && subcommand.options.length > 0;
  const hasGlobalOptions = globalOptions && globalOptions.length > 0;

  if (hasOwnOptions || hasGlobalOptions) {
    out.push(`${c.header("Options:")}`);
    for (const opt of subcommand.options ?? []) {
      out.push(renderOption(opt, false));
    }
    if (hasGlobalOptions) {
      for (const opt of globalOptions!) {
        out.push(renderOption(opt, false));
      }
    }
    if (!hasOwnOptions) {
      // still show --help even if subcommand has no custom options
      out.push(`  ${c.opt("--help")}, ${c.opt("-h")}          ${c.dim("Show this help message")}`);
    }
    out.push("");
  }

  // Examples
  if (subcommand.examples && subcommand.examples.length > 0) {
    out.push(`${c.header("Examples:")}`);
    for (const ex of subcommand.examples) {
      out.push(`  ${c.example(ex)}`);
    }
    out.push("");
  }

  return out.flush();
}

// ── Free-form section helpers ─────────────────────────────────────────────

/**
 * Render an arbitrary command listing section.
 * Useful for categorized help (e.g. "Navigation Commands:", "Debugging Commands:").
 *
 * @param heading   Section heading (e.g. "Navigation Commands:")
 * @param entries   Array of `{ cmd, args?, desc }` tuples
 * @param colWidth  Command name column width (default: 16)
 */
export function renderSection(
  heading: string,
  entries: { cmd: string; args?: string; desc: string }[],
  colWidth: number = 16,
): string {
  const lines = new Lines();
  lines.push(`${c.header(heading)}`);
  for (const entry of entries) {
    const cmdText = c.cmd(entry.cmd);
    const argsText = entry.args ? ` ${c.arg(entry.args)}` : "";
    const col = padVisible(`${cmdText}${argsText}`, colWidth);
    lines.push(`  ${col}  ${c.dim(entry.desc)}`);
  }
  return lines.flush();
}
