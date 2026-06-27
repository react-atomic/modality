/**
 * Text-formatting utilities for CLI help output.
 *
 * Handles column alignment, text wrapping, and display-width calculation
 * (ANSI codes have zero display width).
 */

// ── Display-width helpers ───────────────────────────────────────────────────

/** Strip ANSI escape sequences to get the visible width of a string. */
export function visibleWidth(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").length;
}

/** Right-pad a string to a target visible-column width. */
export function padVisible(s: string, width: number): string {
  const w = visibleWidth(s);
  return w >= width ? s : s + " ".repeat(width - w);
}

// ── Padding helpers ─────────────────────────────────────────────────────────

/**
 * Right-pad the rendered flag column so descriptions align vertically.
 *
 * @param flagDisplayWidth  Visible width of the flag text (without ANSI)
 * @param compact           Compact mode uses narrower target (22 vs 24)
 * @returns                 Padding string (min 2 spaces)
 */
export function flagPad(flagDisplayWidth: number, compact: boolean): string {
  const target = compact ? 22 : 24;
  return " ".repeat(Math.max(2, target - flagDisplayWidth));
}

/** Default subcommand name column width. */
export const DEFAULT_COL_NAME_WIDTH = 16;

/**
 * Right-pad a subcommand name to the configured column width.
 */
export function padName(s: string, width: number = DEFAULT_COL_NAME_WIDTH): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

// ── Text wrapping ───────────────────────────────────────────────────────────

/**
 * Word-wrap text to fit within `maxWidth` columns, with `indent` spaces
 * prepended to each continuation line. Preserves existing newlines.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  indent: number = 0,
): string {
  const indentStr = " ".repeat(indent);
  return text
    .split("\n")
    .map((paragraph) => {
      if (paragraph.length <= maxWidth) return paragraph;
      const words = paragraph.split(" ");
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        if ((current + " " + word).trim().length <= maxWidth) {
          current = current ? current + " " + word : word;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
      return lines.join("\n" + indentStr);
    })
    .join("\n" + indentStr);
}

// ── Line builder ────────────────────────────────────────────────────────────

/**
 * Convenience builder for assembling multi-line text.
 * Handles the common pattern of push + join("\n").
 */
export class Lines {
  private _lines: string[] = [];

  push(line: string = ""): this {
    this._lines.push(line);
    return this;
  }

  concat(lines: string[]): this {
    for (const l of lines) this._lines.push(l);
    return this;
  }

  toString(): string {
    return this._lines.join("\n");
  }

  /** Flush to string and reset. */
  flush(): string {
    const out = this._lines.join("\n");
    this._lines = [];
    return out;
  }
}
