/**
 * Multi-document JSON parsing — the engine behind the `merge` command.
 *
 * Shell `&&` chains produce one stdout stream carrying several independent JSON
 * documents. These helpers turn that stream back into parsed payloads. They
 * live here, apart from the command that drives them, because they are useful
 * on their own: a consuming CLI can parse a captured stream without going
 * through `merge`'s stdin.
 */

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
 * Two shapes reach the sink, because a command may either return a `CLIResult`
 * envelope (the runner serializes it) or print its payload itself and return a
 * bare `{ success: true }` the runner serializes as a second, contentless
 * document:
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
