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

## Repository

- **Git**: https://github.com/react-atomic/modality
- **NPM**: https://www.npmjs.com/package/modality-cli-kit
