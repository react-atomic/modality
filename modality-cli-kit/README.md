# `modality-cli-kit`

Composable CLI utilities for building Bun/TypeScript command-line tools.

## Help Kit (`src/help/`)

A reusable CLI help generation system that powers both the co-chrome and use-stock CLIs.

### Features

- **Declarative metadata** — Define commands as typed data, not template strings
- **Bun-style ANSI colors** — Auto-detects TTY, respects `NO_COLOR`
- **Global help** — Lists all commands with one-line summaries
- **Per-command help** — Detailed flags, usage, and examples per command
- **Flag validation** — Rejects unknown flags with fuzzy-match suggestions
- **Optional-value flags** — One flag can be used bare (`--pin`) or with a value (`--pin 44460`)
- **Semantic helpers** — `cmd()`, `header()`, `opt()`, `arg()`, `dim()`, `example()`, etc.
- **Zero runtime dependencies** — Pure TypeScript

### Quick Start

```ts
import { getHelp } from "modality-cli-kit";
import type { CLICommand } from "modality-cli-kit";

const commands: CLICommand[] = [
  {
    name: "open",
    summary: "Navigate to a URL",
    options: [{ flag: "--url", arg: "<url>", desc: "The URL to open" }],
    examples: ["my-cli open --url https://example.com"],
  },
  {
    name: "click",
    summary: "Click an element",
    options: [{ flag: "--selector", arg: "<sel>", desc: "CSS selector" }],
    examples: ["my-cli click --selector button.submit"],
  },
];

// Global help
console.log(
  getHelp({
    cliName: "my-cli",
    tagline: "My CLI tool",
    commands,
  })
);

// Per-command help
console.log(getHelp({ cliName: "my-cli", commands, command: "open" }));
```

### API

| Function                                                   | Purpose                               |
| ---------------------------------------------------------- | ------------------------------------- |
| `getHelp(options)`                                         | Unified entry: global or per-command  |
| `renderSection(heading, entries)`                          | Render a categorized command section  |
| `rejectUnknownFlags(command, args)`                        | Validate args against known flags     |
| `knownFlags(command, extraFlags?)`                         | Extract known flag set                |
| `levenshtein(a, b)`                                        | Edit distance for fuzzy flag matching |
| `optionalValueFlag(whenBare, whenOff?)`                    | Schema for a flag usable bare OR with a value |
| `autoDefault(whenBare, whenOff?)`                          | The `.transform()` behind it, for custom unions |

#### `getHelp(options)` Options

```ts
interface GetHelpOptions {
  cliName: string;           // CLI binary name, e.g. "my-cli"
  tagline?: string;          // One-line description (global help only)
  commands: CLICommand[];    // All commands to document
  format?: "human" | "json"; // Output format (default: "human")
  command?: string;          // Show help for a specific command by name
  sorted?: boolean;          // Sort commands alphabetically (default: true)
  globalOptions?: Option[];  // Global flags shown in footer
  globalExamples?: string[]; // Global usage examples
  footer?: string;           // Footer text (e.g. "Set NO_COLOR=1 …")
  colNameWidth?: number;     // Command-name column width
}
```

> `commands` (plural, required) is the full list of available commands. `command` (singular, optional) picks one from that list to show detailed help for.

### Optional-Value Flags

A flag's Zod type decides how argv is parsed:

| Shape | Schema | `--flag` alone | `--flag x` |
|---|---|---|---|
| Boolean switch | `z.boolean().optional()` | `true` | next token NOT consumed |
| Required value | `z.string()` / `z.coerce.number()` | error: *requires a value* | `"x"` / `x` |
| **Optional value** | `optionalValueFlag("auto")` | `"auto"` | `"x"` |

```ts
import { optionalValueFlag } from "modality-cli-kit";

const Args = z.object({
  pin: optionalValueFlag("auto").describe("bare = auto-pick; or pass a level"),
});

// --pin          → "auto"      (whenBare)
// --pin 44460    → "44460"
// --pin=noauto   → "noauto"
// --no-pin       → ""          (whenOff; override: optionalValueFlag("auto", "none"))
// (absent)       → undefined   (never invents a value)
```

It expands to `z.union([z.boolean(), z.string()]).optional().transform(autoDefault(whenBare, whenOff))`.
The **boolean member** is what makes the bare form parse; the transform folds it away so handlers
receive `string | undefined` and never `true`.

**Do not use `.default()` for this.** A Zod default fires when the flag is ABSENT, which turns the
feature on for every invocation that never mentioned it — a different thing from "given without a
value". Absent must stay `undefined` so a handler can tell "not requested" from "requested with
defaults".

#### Parser rules

- A bare optional-value flag **does not consume the next token when it looks like a flag** —
  `--pin --human` parses as `pin: "auto"` + `human: true`.
- **Negative numbers are values**: `--offset -5` → `-5`, while `--offset --verbose` errors.
- `--flag=value` always wins over the next-token rule.
- These rules apply to every value-taking flag, not just optional-value ones.

#### `autoDefault` for custom unions

`optionalValueFlag` hardcodes a free-string value member. When the value side needs its own schema,
build the union yourself and reuse the transform:

```ts
mode: z.union([z.boolean(), z.enum(["fast", "slow"])])
  .optional()
  .transform(autoDefault("fast")),
// --mode → "fast" · --mode slow → "slow" · --mode bogus → warning `mode: Invalid input`
```

Caveat: the union validates the **input**, so the transform's output is not re-checked — `--no-mode`
yields `whenOff` (`""`) even though it is not an enum member. Pass a valid member as the second
argument when the off-value must satisfy the same constraint.

### Color Helpers

```ts
import {
  cmd,
  header,
  opt,
  arg,
  dim,
  bold,
  example,
  success,
  error,
} from "modality-cli-kit/help";

console.log(cmd("my-cli open")); // cyan bold
console.log(header("Usage:")); // yellow bold
console.log(opt("--config")); // green
console.log(arg("<file>")); // blue
console.log(dim("description")); // gray dim
console.log(success("✓ done")); // green bold
console.log(error("✗ failed")); // red
```

## Output Format from the Environment

Set the format once instead of repeating `--json` on every command in a chain:

```bash
export OUTPUT=json
use-stock price && use-stock direction
```

`createCliRunner` reads a CLI-scoped variable first, then the shared one — so one tool's setting can't leak into another's:

| Source | Example | Wins over |
|---|---|---|
| Explicit flag | `--json` / `--jsonl` | everything |
| CLI-scoped env | `USE_STOCK_OUTPUT=json` | `OUTPUT` |
| Shared env | `OUTPUT=json` | the default |
| Default | — | `human` |

Accepted values are `human`, `json`, `jsonl` (case-insensitive). An unrecognized value is reported on stderr and ignored, so a typo degrades to the default rather than failing the run.

> **`VAR=x cmd1 && cmd2` sets the variable for `cmd1` only.** A command-prefix assignment scopes to that one command. Use `export OUTPUT=json` (or prefix each command) for a whole chain.

### It rewrites argv, not just the renderer

Handlers commonly read their own `--json` flag to decide what to print. If the environment only changed the *render* format, a handler could print human text that the runner then wrapped as JSON. So the runner appends the matching flag to argv, keeping validation, the handler, and the renderer on one source of truth.

Consequences worth knowing:

- The flag is only injected when your `globalOptionsSchema` declares it — otherwise per-command validation would reject the flag the runner just added.
- `human` injects nothing; its signal is the *absence* of a flag. A command with a bespoke flag for rich output (e.g. `use-stock price --human`) still needs that flag passed.
- Commands your package dispatches before delegating to the runner (raw-passthrough argv) never see the injection.

## Default Commands (`src/defaultCommands/`)

Commands `createCliRunner` registers on your CLI's behalf. You declare nothing — they show up in `--help` and dispatch like any other command.

Adding one is a change to that folder alone: drop the module in beside `merge.ts` and add its factory to `DEFAULT_COMMANDS`. The `DefaultCommandName` union widens automatically, so `withoutDefaultCommand` accepts the new name with no further wiring.

### `merge` — fold a piped chain into one document

A shell `&&` chain writes several independent JSON documents to one stdout stream. `merge` reads that stream and emits a single payload:

```bash
{ use-stock symbol --json && use-stock price --json; } | use-stock merge --json
```
```json
{ "success": true, "result": [ { "symbol": "TXF-S", … }, { "tilt": "long", … } ] }
```

> **The braces are required.** `|` binds tighter than `&&`, so `a && b | merge` pipes only `b` into the sink and lets `a` escape to the terminal. Nothing on the CLI side can recover stdout that never entered the pipe.

What it does to each document:

| Input shape | Result | Why |
|---|---|---|
| `{ success, result }` | unwrapped to `result` | the standard envelope |
| `{ success: true }` alone | dropped | the empty trailer a self-printing command leaves behind |
| `{ success: false, error }` | kept | failures must stay visible |
| anything else | kept as-is | a payload the command printed itself |
| prose between documents | ignored | progress lines on stdout don't break the parse |

Documents are found by delimiter balance, not line breaks, so pretty-printed `--json` output parses as readily as JSONL.

`--flat` shallow-merges the payloads into one object, later document winning on a key collision. Lossy — only use it when the payloads have disjoint keys.

### Opting out

```ts
createCliRunner({ …, withoutDefaultCommand: true });       // register none
createCliRunner({ …, withoutDefaultCommand: ["merge"] });  // register all but these
```

A command your own registry defines under a default's name always wins, so shadowing needs no opt-out.

### Using the parts directly

```ts
import { splitJsonDocs, mergeJsonDocs, createMergeCommand } from "modality-cli-kit";

splitJsonDocs('{"a":1}\n{"b":2}');            // [{ a: 1 }, { b: 2 }]
mergeJsonDocs(text, { flat: true });          // one shallow-merged object
createMergeCommand({ cliName: "my-cli" });    // the CLICommand, to register manually
```

## Repository

- **Git**: https://github.com/react-atomic/modality
- **NPM**: https://www.npmjs.com/package/modality-cli-kit
