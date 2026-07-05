import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { setNoColor } from "../colors";
import {
  generateHelp,
  generateCommandHelp,
  renderCLICommand,
  renderSection,
} from "../generator";
import type { CLICommand, HelpConfig } from "../types";
import { makeCmd } from "./helpers";

// Disable colors for deterministic string comparison
setNoColor(true);

const sampleCLICommands: CLICommand[] = [
  makeCmd({ name: "open", summary: "Navigate to a URL" }),
  makeCmd({ name: "click", summary: "Click an element" }),
  makeCmd({
    name: "price",
    summary: "Price analysis",
    inputSchema: z.object({
      timeframe: z.string().optional().describe("Candle timeframe"),
      lookback: z.coerce.number().optional().describe("Lookback window"),
    }),
    keyMap: { timeframe: { arg: "<TF>" }, lookback: { arg: "<N>" } },
    examples: ["my-cli price 2330", "my-cli price TXF-S"],
  }),
];

const sampleConfig: HelpConfig = {
  cliName: "my-cli",
  tagline: "My CLI tool",
  commands: sampleCLICommands,
  globalOptions: [
    { flag: "--help", arg: "", desc: "Show help" },
    { flag: "--json", desc: "JSON output" },
  ],
  globalExamples: ["my-cli open https://example.com"],
};

describe("generateHelp", () => {
  test("includes CLI name and tagline", () => {
    const help = generateHelp(sampleConfig);
    expect(help).toContain("my-cli");
    expect(help).toContain("My CLI tool");
  });

  test("lists all commands", () => {
    const help = generateHelp(sampleConfig);
    expect(help).toContain("open");
    expect(help).toContain("click");
    expect(help).toContain("price");
  });

  test("includes usage section", () => {
    const help = generateHelp(sampleConfig);
    expect(help).toContain("Usage:");
    expect(help).toContain("my-cli <command>");
  });

  test("includes global options", () => {
    const help = generateHelp(sampleConfig);
    expect(help).toContain("--help");
    expect(help).toContain("--json");
  });

  test("includes global examples", () => {
    const help = generateHelp(sampleConfig);
    expect(help).toContain("my-cli open https://example.com");
  });

  test("includes hint about per-command help", () => {
    const help = generateHelp(sampleConfig);
    expect(help).toContain("<command> --help");
  });

  test("sorts commands alphabetically by default", () => {
    const help = generateHelp({
      ...sampleConfig,
      commands: [
        makeCmd({ name: "zeta", summary: "Z" }),
        makeCmd({ name: "alpha", summary: "A" }),
        makeCmd({ name: "beta", summary: "B" }),
      ],
    });
    // sorted: alpha, beta, zeta
    const alphaIdx = help.indexOf("alpha");
    const betaIdx = help.indexOf("beta");
    const zetaIdx = help.indexOf("zeta");
    expect(alphaIdx).toBeLessThan(betaIdx);
    expect(betaIdx).toBeLessThan(zetaIdx);
  });

  test("respects sorted: false", () => {
    const help = generateHelp({
      ...sampleConfig,
      sorted: false,
      commands: [
        makeCmd({ name: "zeta", summary: "Z" }),
        makeCmd({ name: "alpha", summary: "A" }),
      ],
    });
    const zetaIdx = help.indexOf("zeta");
    const alphaIdx = help.indexOf("alpha");
    expect(zetaIdx).toBeLessThan(alphaIdx);
  });

  test("handles empty commands", () => {
    const help = generateHelp({ ...sampleConfig, commands: [] });
    expect(help).toContain("my-cli");
  });

  test("no error with undefined options", () => {
    const help = generateHelp({
      ...sampleConfig,
      globalOptions: undefined,
      globalExamples: undefined,
    });
    expect(help).toContain("my-cli <command>");
  });

  test("includes footer", () => {
    const help = generateHelp({
      ...sampleConfig,
      footer: "Set NO_COLOR=1 to disable colors.",
    });
    expect(help).toContain("NO_COLOR");
  });

  test("empty command list still renders header", () => {
    const out = renderCLICommand(
      makeCmd({ name: "test", summary: "Test command" }),
      16,
      true,
    );
    expect(out).toContain("test");
    expect(out).toContain("Test command");
  });

  test("non-compact mode renders positionals beneath the summary", () => {
    const out = renderCLICommand(
      makeCmd({ name: "convert", summary: "Convert a value", positionals: [{ flag: "symbol", desc: "Asset symbol" }] }),
      16,
      false,
    );
    expect(out).toContain("<symbol>");
    expect(out).toContain("Asset symbol");
  });
});

describe("generateCommandHelp", () => {
  test("includes CLI name and command name", () => {
    const help = generateCommandHelp("my-cli", sampleCLICommands[2]!);
    expect(help).toContain("my-cli price");
    expect(help).toContain("Price analysis");
  });

  test("includes command with no options", () => {
    const help = generateCommandHelp("my-cli", sampleCLICommands[0]!);
    expect(help).toContain("my-cli open");
    expect(help).toContain("Navigate to a URL");
  });

  test("includes options section", () => {
    const help = generateCommandHelp("my-cli", sampleCLICommands[2]!);
    expect(help).toContain("--timeframe");
    expect(help).toContain("--lookback");
    expect(help).toContain("Candle timeframe");
  });

  test("includes examples", () => {
    const help = generateCommandHelp("my-cli", sampleCLICommands[2]!);
    expect(help).toContain("my-cli price 2330");
    expect(help).toContain("my-cli price TXF-S");
  });

  test("appends global options when provided", () => {
    const help = generateCommandHelp("my-cli", sampleCLICommands[0]!, [
      { flag: "--json", desc: "JSON output" },
    ]);
    expect(help).toContain("--json");
  });

  test("uses custom usage lines", () => {
    const command = makeCmd({
      name: "trade",
      summary: "Manage trades",
      usage: ["my-cli trade <command> [options]", "my-cli trade open --force"],
    });
    const help = generateCommandHelp("my-cli", command);
    expect(help).toContain("my-cli trade <command>");
    expect(help).toContain("my-cli trade open");
  });

  test("renders positionals in the usage line and an Arguments section", () => {
    const command = makeCmd({
      name: "convert",
      summary: "Convert a value",
      positionals: [
        { flag: "symbol", desc: "Asset symbol", required: true },
        { flag: "amount", arg: "<N>", desc: "Amount", type: "number" },
      ],
      inputSchema: z.object({ json: z.boolean().optional().describe("JSON output") }),
    });
    const help = generateCommandHelp("my-cli", command);
    // Usage line lists positional slots before [options]
    expect(help).toContain("my-cli convert <symbol> <amount>");
    // Dedicated Arguments section documents each positional
    expect(help).toContain("Arguments:");
    expect(help).toContain("<symbol>");
    expect(help).toContain("Asset symbol");
    expect(help).toContain("<amount>");
    expect(help).toContain("Amount");
  });
});

describe("renderSection", () => {
  const entries = [
    { cmd: "open", args: "<url>", desc: "Navigate" },
    { cmd: "click", desc: "Click element" },
  ];

  test("includes heading", () => {
    const s = renderSection("Navigation:", entries);
    expect(s).toContain("Navigation:");
  });

  test("includes entries", () => {
    const s = renderSection("Navigation:", entries);
    expect(s).toContain("open <url>");
    expect(s).toContain("click");
    expect(s).toContain("Navigate");
    expect(s).toContain("Click element");
  });
});

// ── Schema-driven help derivation ──────────────────────────────────────────

describe("inputSchema-driven help", () => {
  const schemaCmd: CLICommand = makeCmd({
    name: "backtest",
    summary: "Score rules",
    inputSchema: z.object({
      days: z.coerce.number().int().positive().optional().describe("replay last n days"),
      symbol: z.string().describe("asset symbol"),
      json: z.boolean().optional().describe("machine-readable report"),
    }),
    positionalKeys: ["symbol"],
    keyMap: { days: { arg: "<n>" } },
  });

  test("generateCommandHelp derives options and positionals from inputSchema", () => {
    const s = generateCommandHelp("my-cli", schemaCmd);
    expect(s).toContain("--days <n>");
    expect(s).toContain("replay last n days");
    expect(s).toContain("--json");
    expect(s).toContain("machine-readable report");
    // positional: bare name, in usage and arguments
    expect(s).toContain("<symbol>");
    expect(s).toContain("asset symbol");
    expect(s).not.toContain("--symbol");
  });

  test("explicit positionals win over inputSchema-derived ones", () => {
    const manual: CLICommand = makeCmd({
      name: "manual",
      summary: "Manual",
      inputSchema: z.object({ target: z.string().describe("from schema") }),
      positionalKeys: ["target"],
      positionals: [{ flag: "list", desc: "sub-command entry" }],
    });
    const s = generateCommandHelp("my-cli", manual);
    expect(s).toContain("<list>");
    expect(s).not.toContain("<target>");
  });

  test("global options duplicated by the command's own schema are skipped", () => {
    const cmd: CLICommand = makeCmd({
      name: "backtest",
      summary: "Backtest",
      inputSchema: z.object({
        days: z.coerce.number().optional().describe("replay last n days"),
        json: z.boolean().optional().describe("machine-readable full report"),
      }),
    });
    const s = generateCommandHelp("my-cli", cmd, [
      { flag: "--help, -h", desc: "Show this help message" },
      { flag: "--json", desc: "output JSON" },
      { flag: "--no-cache", desc: "skip cache" },
    ]);
    expect(s.match(/--json/g)).toHaveLength(1);
    // The command's own description wins over the generic global one
    expect(s).toContain("machine-readable full report");
    expect(s).not.toContain("output JSON");
    // Non-duplicated globals still render
    expect(s).toContain("--no-cache");
    expect(s.match(/--help/g)).toHaveLength(1);
  });

  test("no duplicate --help when global options already list it", () => {
    const bare: CLICommand = makeCmd({ name: "bare", summary: "Bare" });
    const s = generateCommandHelp("my-cli", bare, [
      { flag: "--help, -h", desc: "Show this help message" },
      { flag: "--json", desc: "JSON output" },
    ]);
    expect(s.match(/--help/g)).toHaveLength(1);
  });

  test("command without inputSchema exposes no flags of its own", () => {
    const bare: CLICommand = makeCmd({ name: "bare", summary: "Bare" });
    const s = generateCommandHelp("my-cli", bare, [{ flag: "--json", desc: "JSON output" }]);
    expect(s).toContain("--json");   // global options still render
    expect(s).toContain("--help");   // fallback help line for commands with no own options
    expect(s).not.toContain("--bare");
  });

  test("renderCLICommand (non-compact) derives options from inputSchema", () => {
    const s = renderCLICommand(schemaCmd, 16, false);
    expect(s).toContain("--days <n>");
    expect(s).toContain("<symbol>");
  });

  test("global --no-cache skipped when command schema has noCache", () => {
    const cmd: CLICommand = makeCmd({
      name: "cached",
      summary: "Cached operation",
      inputSchema: z.object({
        noCache: z.boolean().default(true).describe("skip disk cache"),
        verbose: z.boolean().optional().describe("verbose logging"),
      }),
    });
    // normalizing noCache → no-cache in schema means the global --no-cache
    // token matches and gets deduped
    const s = generateCommandHelp("my-cli", cmd, [
      { flag: "--json", desc: "JSON output" },
      { flag: "--no-cache", desc: "disable cache" },
    ]);
    // (schema-driven --no-cache already renders it once per schema own options)
    // own options = --no-cache + --verbose (both from the schema)
    // global --no-cache should be deduped; global --json should still appear
    expect(s.match(/--no-cache/g)).toHaveLength(1);
    expect(s).toContain("skip disk cache");
    expect(s).toContain("--json");
    expect(s).toContain("--verbose");
  });

  test("schema-defined help flag prevents fallback --help line", () => {
    const cmd: CLICommand = makeCmd({
      name: "mycmd",
      summary: "My command",
      inputSchema: z.object({
        help: z.boolean().optional().describe("Show this help message"),
        json: z.boolean().optional().describe("JSON output"),
      }),
    });
    const s = generateCommandHelp("my-cli", cmd);
    // The schema-derived --help option appears only once
    expect(s.match(/--help/g)).toHaveLength(1);
    expect(s).toContain("Show this help message");
  });
});
