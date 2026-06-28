/**
 * Demo: using the help kit to recreate co-chrome & use-stock style help.
 *
 * Run: bun run src/help/demo.ts
 */

import { generateHelp, generateCommandHelp, renderSection } from "./generator";
import type { CLICommand, HelpConfig } from "./types";

// ── Simulate co-chrome style (categorized commands) ────────────────────────

const chromeCLICommands = [
  {
    name: "open",
    summary: "Navigate to a URL (aliases: goto, navigate)",
    options: [
      { flag: "--wait-until", arg: "<condition>", desc: "Wait: load, domcontentloaded, networkidle" },
    ],
    examples: ["co-chrome open https://example.com"],
  },
  {
    name: "click",
    summary: "Click on an element",
    options: [
      { flag: "--selector", arg: "<selector>", desc: "CSS selector or ref (@e1)" },
      { flag: "--force", desc: "Force click via JavaScript" },
    ],
    examples: ["co-chrome click --selector @e1"],
  },
  {
    name: "fill",
    summary: "Fill an input field",
    options: [
      { flag: "--selector", arg: "<selector>", desc: "CSS selector" },
      { flag: "--text", arg: "<text>", desc: "Text to fill" },
    ],
    examples: ["co-chrome fill --selector @e5 --text 'hello'"],
  },
  {
    name: "screenshot",
    summary: "Capture screenshot",
    examples: ["co-chrome screenshot --full page.png"],
  },
  {
    name: "eval",
    summary: "Execute JavaScript",
    examples: ["co-chrome eval 'document.title'"],
  },
  {
    name: "tab",
    summary: "Manage browser tabs",
    examples: ["co-chrome tab", "co-chrome tab 2"],
  },
  {
    name: "daemon",
    summary: "Manage background daemon",
    examples: ["co-chrome daemon start"],
  },
  {
    name: "verify",
    summary: "Validate a YAML operator config file",
    options: [
      { flag: "--config", arg: "<file>", desc: "Path to YAML config" },
    ],
    examples: ["co-chrome verify --config login.yaml"],
  },
  {
    name: "e2e",
    summary: "Run E2E operator test via CDP",
    options: [
      { flag: "--config", arg: "<file>", desc: "Path to YAML config" },
      { flag: "--headed", desc: "Launch browser in headed mode" },
      { flag: "--verbose", desc: "Show detailed step-by-step results" },
    ],
    examples: ["co-chrome e2e --config login.yaml --verbose"],
  },
] as CLICommand[];

const chromeHelp: HelpConfig = {
  cliName: "co-chrome",
  tagline: "Chrome DevTools CLI — Browser automation tool",
  commands: chromeCLICommands,
  globalOptions: [
    { flag: "--help", arg: "", desc: "Show this help message" },
    { flag: "--version", desc: "Show version information" },
    { flag: "--json", desc: "Output in JSON format" },
  ],
  globalExamples: [
    "co-chrome open https://example.com",
    "co-chrome click @e3",
  ],
  footer: "Pipe-friendly — auto-detects TTY and respects NO_COLOR.",
};

// ── Simulate use-stock style (flat command list) ────────────────────────────

const stockCLICommands = [
  { name: "volatility", summary: "TX futures three-session volatility" },
  { name: "max-pain", summary: "TXO weekly options Max Pain calculator" },
  { name: "plan", summary: "Structured trading plan (SKILL.mdx format)" },
  { name: "symbol", summary: "LLM entry-decision dataset for TX futures" },
  {
    name: "price",
    summary: "K 線進場價建議",
    options: [
      { flag: "--timeframe", arg: "<TF>", desc: "K 線週期 (default: 1m)" },
      { flag: "--lookback", arg: "<N>", desc: "K 線觀察視窗 (default: 60)" },
      { flag: "--human", desc: "也印一段中文摘要到 stderr" },
      { flag: "--watch", desc: "即時自動更新模式" },
    ],
    examples: ["use-stock price 2330", "use-stock price TXF-S --watch --interval 5"],
  },
  { name: "direction", summary: "盤勢方向判定 — 波動走多少、還剩多少空間" },
  { name: "fomo-tw", summary: "PTT Stock 股版貼文 + 推文數" },
] as CLICommand[];

const stockHelp: HelpConfig = {
  cliName: "use-stock",
  tagline: "Taiwan stock & TX futures CLI toolkit",
  commands: stockCLICommands,
  globalOptions: [
    { flag: "--help", arg: "", desc: "Show this help message" },
    { flag: "--json", desc: "Most commands accept this for JSON output" },
  ],
  globalExamples: [
    "use-stock price 2330 --timeframe 1m",
    "use-stock price TXF-S --watch",
  ],
  footer: "Set NO_COLOR=1 to disable colored output.",
};

// ── Demo runner ────────────────────────────────────────────────────────────

console.log("=".repeat(60));
console.log("  CO-CHROME STYLE HELP");
console.log("=".repeat(60));
console.log(generateHelp(chromeHelp));
console.log("");

console.log("=".repeat(60));
console.log("  USE-STOCK STYLE HELP");
console.log("=".repeat(60));
console.log(generateHelp(stockHelp));
console.log("");

console.log("=".repeat(60));
console.log("  PER-COMMAND HELP (co-chrome click)");
console.log("=".repeat(60));
console.log(generateCommandHelp("co-chrome", chromeCLICommands[1]!));
console.log("");

console.log("=".repeat(60));
console.log("  PER-COMMAND HELP (use-stock price)");
console.log("=".repeat(60));
console.log(generateCommandHelp("use-stock", stockCLICommands[4]!));
