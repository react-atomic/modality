/**
 * CLI help text generator — composable, reusable across CLIs.
 *
 * Two output modes:
 *   1. **Global help** (`generateHelp`) — lists all commands with one-liners
 *   2. **Per-command help** (`generateCommandHelp`) — detailed flags, usage, examples
 */

import { z } from "zod";
import * as c from "./colors";
import { padName, padVisible, flagPad, visibleWidth, Lines } from "./formatter";
import { schemaToCliOptions, buildKeyMap } from "./zod-cli";
import type { CLICommand, HelpConfig, Option } from "./types";

/**
 * Resolve a command's options + positionals for display.
 *
 * Options are always derived from the command's Zod `inputSchema`
 * (+ `positionalKeys`/`keyMap`) — a command without a schema has no flags of
 * its own. Explicit `positionals` win over schema-derived ones (used for
 * sub-command style entries that a Zod object can't express).
 */
function cliSurface(cmd: CLICommand): { options: Option[]; positionals: Option[] } {
  const explicitPositionals = cmd.positionals ?? [];
  if (!(cmd.inputSchema instanceof z.ZodObject)) {
    return { options: [], positionals: explicitPositionals };
  }

  const derived = schemaToCliOptions(
    cmd.inputSchema as z.ZodObject<Record<string, z.ZodTypeAny>>,
    buildKeyMap(cmd.positionalKeys, cmd.keyMap),
  );
  return {
    options: derived.options,
    positionals: explicitPositionals.length > 0
      ? explicitPositionals
      : derived.positionals,
  };
}

/**
 * Render one positional-argument line: `<name>   description`.
 * Shared by the command index and per-command help so both stay in sync.
 */
function renderPositional(pos: Option, indent: string): string {
  const name = c.arg(`<${pos.flag}>`);
  const pad = flagPad(pos.flag.length + 2, false);
  return `${indent}${name}${pad}${c.dim(pos.desc)}`;
}

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

// ── Command rendering ─────────────────────────────────────────────────────

/**
 * Render one command entry for the global help index.
 *
 * Compact mode (used inside the command list):
 *   price              K 線進場價建議
 *   --timeframe <TF>   週期
 *
 * Non-compact renders the options as well:
 *   price              K 線進場價建議
 *     --timeframe <TF>  週期
 *     --lookback <N>    觀察窗
 */
export function renderCLICommand(
  cmd: CLICommand,
  colNameWidth: number = 16,
  compact: boolean = true,
): string {
  const nameCol = c.cmd(padName(cmd.name ?? "", colNameWidth));

  if (compact) {
    // Single-line: name + summary only
    return `  ${nameCol}${c.dim(cmd.summary ?? "")}`;
  }

  // Non-compact: name + summary + positionals + options below
  const { options, positionals } = cliSurface(cmd);
  const lines = new Lines();
  lines.push(`  ${nameCol}${c.dim(cmd.summary ?? "")}`);
  for (const pos of positionals) {
    lines.push(renderPositional(pos, "    "));
  }
  for (const opt of options) {
    lines.push(renderOption(opt, false));
  }
  return lines.flush();
}

// ── Global help ────────────────────────────────────────────────────────────

/**
 * Generate the main help page listing all commands.
 *
 * ```text
 * co-chrome — Chrome DevTools CLI
 *
 * Usage: co-chrome <command> [options]
 *
 * Commands:
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
    commands,
    globalOptions,
    globalExamples,
    footer,
    colNameWidth = 16,
  } = config;

  // Sort if not explicitly kept in order
  const sorted = config.sorted !== false;
  const cmds = sorted
    ? [...commands].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    : commands;

  const out = new Lines();

  // Header
  out.push("");
  out.push(`${c.bold(cliName)} ${c.dim(`— ${tagline}`)}`);
  out.push("");

  // Usage
  out.push(`${c.header("Usage:")}  ${c.cmd(cliName)} ${c.arg("<command>")} ${c.dim("[options]")}`);
  out.push("");

  // Commands
  out.push(`${c.header("Commands:")}`);
  for (const cmd of cmds) {
    out.push(renderCLICommand(cmd, colNameWidth, true));
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
 * Generate detailed help for a single CLI command.
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
 * @param command       The CLICommand metadata
 * @param globalOptions Optional global options to append to the options list
 */
export function generateCommandHelp(
  cliName: string,
  command: CLICommand,
  globalOptions?: Option[],
): string {
  const { options, positionals } = cliSurface(command);
  const out = new Lines();
  out.push("");
  out.push(`${c.bold(`${cliName} ${command.name}`)} ${c.dim(`— ${command.summary ?? ""}`)}`);
  out.push("");

  // Usage
  if (command.usage && command.usage.length > 0) {
    const [first, ...rest] = command.usage;
    out.push(`${c.header("Usage:")}  ${c.cmd(first!)}`);
    for (const line of rest) out.push(`        ${c.cmd(line)}`);
  } else {
    const posSlots = positionals
      .map((pos) => c.arg(`<${pos.flag}>`))
      .join(" ");
    const usageParts = [c.cmd(cliName), c.cmd(command.name ?? ""), posSlots, c.dim("[options]")];
    out.push(`${c.header("Usage:")}  ${usageParts.filter(Boolean).join(" ")}`);
  }
  out.push("");

  // Positional Arguments
  if (positionals.length > 0) {
    out.push(`${c.header("Arguments:")}`);
    for (const pos of positionals) {
      out.push(renderPositional(pos, "  "));
    }
    out.push("");
  }

  // Options
  const hasOwnOptions = options.length > 0;
  const hasGlobalOptions = globalOptions && globalOptions.length > 0;

  if (hasOwnOptions || hasGlobalOptions) {
    out.push(`${c.header("Options:")}`);
    for (const opt of options) {
      out.push(renderOption(opt, false));
    }
    if (hasGlobalOptions) {
      for (const opt of globalOptions!) {
        out.push(renderOption(opt, false));
      }
    }
    if (!hasOwnOptions) {
      // still show --help even if command has no custom options
      out.push(`  ${c.opt("--help")}, ${c.opt("-h")}          ${c.dim("Show this help message")}`);
    }
    out.push("");
  }

  // Examples
  if (command.examples && command.examples.length > 0) {
    out.push(`${c.header("Examples:")}`);
    for (const ex of command.examples) {
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
