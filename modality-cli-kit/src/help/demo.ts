/**
 * Demo: schema-driven CLI help via `buildCliFromTools`.
 *
 * Each command is a `CLICommand`: flags live in its Zod `inputSchema`,
 * CLI metadata (positionals, flag overrides, examples, aliases) sits
 * alongside it. `buildCliFromTools` derives everything else — help pages,
 * alias resolution, and flag rejection.
 *
 * Run: bun run src/help/demo.ts
 */

import { z } from "zod";
import { buildCliFromTools } from "./cli-builder";
import type { CLICommand } from "./types";

const tools: Partial<CLICommand>[] = [
  {
    name: "open",
    description: "Navigate to a URL",
    aliases: ["goto", "navigate"],
    inputSchema: z.object({
      url: z.string().describe("URL to open"),
      waitUntil: z.string().optional().describe("Wait: load, domcontentloaded, networkidle"),
    }),
    positionalKeys: ["url"],
    keyMap: { waitUntil: { arg: "<condition>" } },
    examples: ["web-cli open https://example.com"],
  },
  {
    name: "click",
    description: "Click on an element",
    inputSchema: z.object({
      selector: z.string().describe("CSS selector"),
      force: z.boolean().optional().describe("Force click via JavaScript"),
    }),
    positionalKeys: ["selector"],
    examples: ["web-cli click .submit", "web-cli click .btn --force"],
  },
  {
    name: "fill",
    description: "Fill an input field",
    inputSchema: z.object({
      selector: z.string().describe("CSS selector"),
      text: z.string().describe("Text to fill"),
    }),
    positionalKeys: ["selector"],
    keyMap: { text: { arg: "<text>" } },
    examples: ["web-cli fill #search --text 'hello'"],
  },
  {
    name: "screenshot",
    description: "Capture screenshot",
    examples: ["web-cli screenshot --full page.png"],
  },
  {
    name: "e2e",
    description: "Run E2E test from a YAML config",
    inputSchema: z.object({
      config: z.string().describe("Path to YAML config"),
      headed: z.boolean().optional().describe("Launch browser in headed mode"),
      verbose: z.boolean().optional().describe("Show detailed step-by-step results"),
    }),
    keyMap: { config: { arg: "<file>" } },
    examples: ["web-cli e2e --config login.yaml --verbose"],
  },
];

const cli = buildCliFromTools(tools, {
  cliName: "web-cli",
  tagline: "Browser automation toolkit (demo)",
  globalOptionsSchema: z.object({
    help: z.boolean().optional().describe("Show this help message"),
    version: z.boolean().optional().describe("Show version information"),
    json: z.boolean().optional().describe("Output in JSON format"),
  }),
  globalExamples: [
    "web-cli open https://example.com",
    "web-cli click .submit",
  ],
  footer: "Pipe-friendly — auto-detects TTY and respects NO_COLOR.",
});

// ── Demo runner ────────────────────────────────────────────────────────────

function section(title: string): void {
  console.log("=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

section("GLOBAL HELP");
console.log(cli.getHelp());

section("PER-COMMAND HELP (web-cli click)");
console.log(cli.getHelp("click"));

section("ALIAS RESOLUTION (goto → open)");
console.log(cli.getHelp("goto"));

section("FLAG REJECTION");
const reject = cli.createFlagRejector();
console.log("web-cli click --froce  →", reject("click", ["--froce"]));
console.log("web-cli click --force  →", reject("click", ["--force"]));
