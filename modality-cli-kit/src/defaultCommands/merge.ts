/**
 * `merge` — a stdin sink that combines the JSON output of several CLI runs.
 *
 * Shell `&&` chains produce one stdout stream carrying several independent JSON
 * documents. This module turns that stream back into a single document so a
 * downstream consumer (an LLM, `jq`, a script) reads one payload instead of
 * re-implementing the parsing every time:
 *
 * ```bash
 * { my-cli alpha && my-cli beta; } | my-cli merge --json
 * ```
 *
 * Note the braces. `|` binds tighter than `&&` in POSIX shells, so
 * `my-cli alpha && my-cli beta | my-cli merge` pipes only `beta` into the sink
 * and lets `alpha` escape to the terminal. No CLI-side handling can recover
 * stdout that never entered the pipe.
 *
 * ## Quick start
 *
 * ```ts
 * import { createMergeCommand } from "modality-cli-kit";
 *
 * export const registry = createCommandRegistry([...commands, createMergeCommand()]);
 * ```
 */
import { z } from "zod";
import type { CLICommand } from "../help/types";
import type { CLIResult } from "../output";

// ── Document scanning ────────────────────────────────────────────────────────

/** Opening delimiters of a top-level JSON document. */
const OPENERS = "{[";

/**
 * Find the end index (exclusive) of the balanced JSON value starting at
 * `start`, or -1 when the input runs out mid-value. Quoted strings are skipped
 * wholesale so braces and brackets inside them never move the depth counter.
 *
 * Any closer balances any opener — a mismatched pair isn't caught here, it
 * just makes the scanned region fail `JSON.parse` downstream, where
 * {@link splitJsonDocs} resyncs one character on.
 */
function scanBalanced(text: string, start: number): number {
  let depth = 0;
  let inString = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;

    if (inString) {
      // A backslash escapes the next character, including a closing quote.
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }

  return -1;
}

/**
 * Split a stream of concatenated JSON documents into parsed values.
 *
 * Handles pretty-printed multi-document output (what `--json` emits), not just
 * JSONL — documents are found by delimiter balance, not by line breaks. Text
 * between documents is ignored, so progress lines a command writes to stdout
 * ("Fetching …") don't break the parse.
 */
export function splitJsonDocs(text: string): unknown[] {
  const docs: unknown[] = [];
  let i = 0;

  while (i < text.length) {
    const start = findOpener(text, i);
    if (start === -1) break;

    const end = scanBalanced(text, start);
    // An unbalanced tail means the stream was truncated — nothing further to read.
    if (end === -1) break;

    try {
      docs.push(JSON.parse(text.slice(start, end)));
      i = end;
    } catch {
      // A stray delimiter in prose (e.g. a log line) opened a region that isn't
      // JSON. Resync one character on rather than skipping the whole span, so a
      // real document nested behind the false start is still found.
      i = start + 1;
    }
  }

  return docs;
}

/** Index of the next `{` or `[` at or after `from`, or -1 when there is none. */
function findOpener(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (OPENERS.includes(text[i]!)) return i;
  }
  return -1;
}

// ── Envelope normalization ───────────────────────────────────────────────────

/** Keys that make a `{ success }` object carry real content. */
const PAYLOAD_KEYS = ["result", "message", "error", "meta", "data"] as const;

/** True for a plain object (not null, not an array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reduce a document to the payload worth merging, or `undefined` to drop it.
 *
 * Two shapes reach the sink, because a command may either return a
 * {@link CLIResult} envelope (the runner serializes it) or print its payload
 * itself and return a bare `{ success: true }` the runner serializes as a
 * second, contentless document:
 *
 *  - `{ success, result }` → unwrapped to `result`
 *  - `{ success }` with nothing else → dropped as the empty trailing envelope
 *  - anything else → kept as-is (a self-printed payload)
 *
 * Dropping is deliberately narrower than "has a `success` key": a command whose
 * payload legitimately contains `success` keeps its data.
 */
function toPayload(doc: unknown): unknown {
  if (!isRecord(doc) || !("success" in doc)) return doc;

  const carriesContent = PAYLOAD_KEYS.some((key) => doc[key] !== undefined);
  if (!carriesContent) return undefined;

  return "result" in doc ? doc.result : doc;
}

/**
 * Parse a merged stdout stream into its payloads, dropping empty envelopes and
 * unwrapping enveloped results.
 *
 * With `flat`, payloads are shallow-merged into one object and a later document
 * wins on a key collision — lossy, and only meaningful when the payloads have
 * disjoint keys. The default array preserves every document.
 */
export function mergeJsonDocs(
  text: string,
  options?: { flat?: boolean },
): unknown[] | Record<string, unknown> {
  const payloads = splitJsonDocs(text)
    .map(toPayload)
    .filter((payload) => payload !== undefined);

  if (!options?.flat) return payloads;

  return payloads.reduce<Record<string, unknown>>((merged, payload) => {
    if (!isRecord(payload)) return merged;
    for (const [key, value] of Object.entries(payload)) {
      // A payload can't be allowed to rewrite the merged object's prototype via
      // `Object.assign`'s [[Set]] of `__proto__` — keys the result never
      // own-declared would leak in as inherited properties for its consumers.
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      merged[key] = value;
    }
    return merged;
  }, {});
}

// ── Command ──────────────────────────────────────────────────────────────────

/** Read stdin to completion as UTF-8 text. */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  // Buffer.from normalizes whatever the stream yields (string or Buffer) —
  // no cast needed, and it stays correct if the runtime changes chunk type.
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

const MergeArgsSchema = z.object({
  flat: z
    .boolean()
    .optional()
    .describe("Shallow-merge payloads into one object (later document wins on collision)"),
});

/** Options for {@link createMergeCommand}. */
export interface MergeCommandOptions {
  /** Command name in help and dispatch (default: `"merge"`). */
  name?: string;
  /** Binary name used in the generated examples (default: `"<cli>"`). */
  cliName?: string;
  /**
   * Two of the consuming CLI's own command names, so the examples are
   * copy-pasteable rather than placeholders (default: `["alpha", "beta"]`).
   */
  exampleCommands?: [string, string];
}

/**
 * Build the `merge` {@link CLICommand} for a CLI to register.
 *
 * It is CLI-agnostic — it reads whatever JSON arrives on stdin, so it merges
 * output from any command, and from other tools that emit JSON too.
 */
export function createMergeCommand(options?: MergeCommandOptions): CLICommand {
  const {
    name = "merge",
    cliName = "<cli>",
    exampleCommands: [first, second] = ["alpha", "beta"],
  } = options ?? {};

  const chain = `{ ${cliName} ${first} --json && ${cliName} ${second} --json; }`;
  const usageHint = `${name} reads JSON on stdin. Wrap the chain in braces — \`|\` binds tighter than \`&&\`, so without them only the last command reaches the pipe:\n  ${chain} | ${cliName} ${name} --json`;

  return {
    name,
    // Kept to one line: the help generator renders this in the command index.
    description: "Merge the JSON output of piped commands into one document",
    inputSchema: MergeArgsSchema,
    usage: [
      `${chain} | ${cliName} ${name} [options]`,
      "",
      "Drops the empty success envelopes a self-printing command leaves behind,",
      "unwraps { success, result } envelopes, and emits the payloads as one array.",
    ],
    examples: [
      `${chain} | ${cliName} ${name} --json`,
      `${chain} | ${cliName} ${name} --flat --json`,
    ],
    async execute(args: z.infer<typeof MergeArgsSchema>): Promise<CLIResult> {
      // An interactive stdin would block forever waiting for input that is
      // never coming, so fail with the usage instead of hanging.
      if (process.stdin.isTTY) return { success: false, error: usageHint };

      const text = await readStdin();
      if (text.trim().length === 0) {
        return { success: false, error: `No input on stdin.\n${usageHint}` };
      }

      const merged = mergeJsonDocs(text, { flat: args.flat });
      const count = Array.isArray(merged) ? merged.length : Object.keys(merged).length;
      if (count === 0) {
        return { success: false, error: `${name} found no JSON documents in stdin` };
      }

      return { success: true, result: merged };
    },
  };
}
