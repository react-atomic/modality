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
