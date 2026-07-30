import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { setNoColor } from "../colors";
import {
  renderCLICommand,
  renderSection,
  getHelp,
} from "../generator";
import type { CLICommand, HelpConfig, GetHelpOptions } from "../types";
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

describe("getHelp — global help (human format)", () => {
  test("includes CLI name and tagline", () => {
    const help = getHelp({ ...sampleConfig, format: "human" });
    expect(help).toContain("my-cli");
    expect(help).toContain("My CLI tool");
  });

  test("lists all commands", () => {
    const help = getHelp({ ...sampleConfig, format: "human" });
    expect(help).toContain("open");
    expect(help).toContain("click");
    expect(help).toContain("price");
  });

  test("includes usage section", () => {
    const help = getHelp({ ...sampleConfig, format: "human" });
    expect(help).toContain("Usage:");
    expect(help).toContain("my-cli <command>");
  });

  test("includes global options", () => {
    const help = getHelp({ ...sampleConfig, format: "human" });
    expect(help).toContain("--help");
    expect(help).toContain("--json");
  });

  test("includes global examples", () => {
    const help = getHelp({ ...sampleConfig, format: "human" });
    expect(help).toContain("my-cli open https://example.com");
  });

  test("includes hint about per-command help", () => {
    const help = getHelp({ ...sampleConfig, format: "human" });
    expect(help).toContain("<command> --help");
  });

  test("sorts commands alphabetically by default", () => {
    const help = getHelp({
      ...sampleConfig,
      commands: [
        makeCmd({ name: "zeta", summary: "Z" }),
        makeCmd({ name: "alpha", summary: "A" }),
        makeCmd({ name: "beta", summary: "B" }),
      ],
      format: "human",
    });
    const alphaIdx = help.indexOf("alpha");
    const betaIdx = help.indexOf("beta");
    const zetaIdx = help.indexOf("zeta");
    expect(alphaIdx).toBeLessThan(betaIdx);
    expect(betaIdx).toBeLessThan(zetaIdx);
  });

  test("respects sorted: false", () => {
    const help = getHelp({
      ...sampleConfig,
      sorted: false,
      commands: [
        makeCmd({ name: "zeta", summary: "Z" }),
        makeCmd({ name: "alpha", summary: "A" }),
      ],
      format: "human",
    });
    const zetaIdx = help.indexOf("zeta");
    const alphaIdx = help.indexOf("alpha");
    expect(zetaIdx).toBeLessThan(alphaIdx);
  });

  test("handles empty commands", () => {
    const help = getHelp({ ...sampleConfig, commands: [], format: "human" });
    expect(help).toContain("my-cli");
  });

  test("no error with undefined options", () => {
    const help = getHelp({
      ...sampleConfig,
      globalOptions: undefined,
      globalExamples: undefined,
      format: "human",
    });
    expect(help).toContain("my-cli <command>");
  });

  test("includes footer", () => {
    const help = getHelp({
      ...sampleConfig,
      footer: "Set NO_COLOR=1 to disable colors.",
      format: "human",
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

describe("getHelp — per-command help (human format)", () => {
  test("includes CLI name and command name", () => {
    const help = getHelp({ cliName: "my-cli", commands: [sampleCLICommands[2]!], command: "price", format: "human" });
    expect(help).toContain("my-cli price");
    expect(help).toContain("Price analysis");
  });

  test("includes command with no options", () => {
    const help = getHelp({ cliName: "my-cli", commands: [sampleCLICommands[0]!], command: "open", format: "human" });
    expect(help).toContain("my-cli open");
    expect(help).toContain("Navigate to a URL");
  });

  test("includes options section", () => {
    const help = getHelp({ cliName: "my-cli", commands: [sampleCLICommands[2]!], command: "price", format: "human" });
    expect(help).toContain("--timeframe");
    expect(help).toContain("--lookback");
    expect(help).toContain("Candle timeframe");
  });

  test("includes examples", () => {
    const help = getHelp({ cliName: "my-cli", commands: [sampleCLICommands[2]!], command: "price", format: "human" });
    expect(help).toContain("my-cli price 2330");
    expect(help).toContain("my-cli price TXF-S");
  });

  test("appends global options when provided", () => {
    const help = getHelp({
      cliName: "my-cli",
      commands: [sampleCLICommands[0]!],
      command: "open",
      globalOptions: [{ flag: "--json", desc: "JSON output" }],
      format: "human",
    });
    expect(help).toContain("--json");
  });

  test("uses custom usage lines", () => {
    const command = makeCmd({
      name: "trade",
      summary: "Manage trades",
      usage: ["my-cli trade <command> [options]", "my-cli trade open --force"],
    });
    const help = getHelp({ cliName: "my-cli", commands: [command], command: "trade", format: "human" });
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
    const help = getHelp({ cliName: "my-cli", commands: [command], command: "convert", format: "human" });
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

// ── Unified getHelp (human + JSON) ───────────────────────────────────────────

describe("getHelp — human format", () => {
  test("delegates to global help when no command or format given", () => {
    const help = getHelp({ cliName: "my-cli", commands: sampleCLICommands });
    expect(help).toContain("my-cli —");
    expect(help).toContain("price");
    expect(help).toContain("click");
  });

  test("delegates to per-command help when command name given", () => {
    const help = getHelp({ cliName: "my-cli", commands: sampleCLICommands, command: "price" });
    expect(help).toContain("my-cli price");
    expect(help).toContain("Price analysis");
    expect(help).toContain("--timeframe");
  });

  test("returns error message for an unknown command name", () => {
    const help = getHelp({ cliName: "my-cli", commands: sampleCLICommands, command: "nope" });
    expect(help).toContain('Unknown command: "nope"');
  });

  test("default format is human when format field is omitted", () => {
    const help = getHelp({ cliName: "my-cli", commands: [sampleCLICommands[0]!] });
    expect(help).toContain("open");
    expect(help).not.toContain("json");
  });
});

describe("getHelp — JSON format", () => {
  test("returns structured JSON with cliName and commands", () => {
    const raw = getHelp({ cliName: "my-cli", commands: sampleCLICommands, format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.cliName).toBe("my-cli");
    expect(parsed.commands).toHaveLength(3);
    expect(parsed.commands.map((c: Record<string, unknown>) => c.name)).toEqual([
      "click", "open", "price",
    ]);
  });

  test("returns valid JSON for empty commands list", () => {
    const raw = getHelp({ cliName: "my-cli", commands: [], format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.cliName).toBe("my-cli");
    expect(parsed.commands).toEqual([]);
  });

  test("falls back to description when command has no summary", () => {
    const cmd = makeCmd({ name: "bare", description: "Fallback description" });
    const raw = getHelp({ cliName: "my-cli", commands: [cmd], command: "bare", format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.command.summary).toBe("Fallback description");
  });

  test("summary wins over description when both are present", () => {
    const cmd = makeCmd({ name: "both", summary: "Explicit summary", description: "Hidden description" });
    const raw = getHelp({ cliName: "my-cli", commands: [cmd], command: "both", format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.command.summary).toBe("Explicit summary");
  });

  test("returns single command when command name given", () => {
    const raw = getHelp({ cliName: "my-cli", commands: sampleCLICommands, command: "price", format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.cliName).toBe("my-cli");
    expect(parsed.command).toBeDefined();
    expect(parsed.command.name).toBe("price");
    expect(parsed.command.summary).toBe("Price analysis");
  });

  test("returns error JSON for unknown command", () => {
    const raw = getHelp({ cliName: "my-cli", commands: sampleCLICommands, command: "nope", format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.error).toContain('Unknown command: "nope"');
  });

  test("includes aliases when the command has them", () => {
    const cmds = [
      ...sampleCLICommands,
      makeCmd({ name: "signals", summary: "Trading signals", aliases: ["sig", "sigs"] }),
    ];
    const raw = getHelp({ cliName: "my-cli", commands: cmds, command: "signals", format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.command.aliases).toEqual(["sig", "sigs"]);
  });

  test("includes options, positionals from schema-driven commands", () => {
    // price has inputSchema + keyMap → should derive options
    const raw = getHelp({ cliName: "my-cli", commands: sampleCLICommands, command: "price", format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.command.options).toBeDefined();
    expect(parsed.command.options.length).toBeGreaterThanOrEqual(1);
    expect(parsed.command.options.map((o: Record<string, unknown>) => o.flag)).toContain("--timeframe");
  });

  test("omits options/positionals when command has no schema", () => {
    // open has no inputSchema → no derived options
    const raw = getHelp({ cliName: "my-cli", commands: sampleCLICommands, command: "open", format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.command.options).toBeUndefined();
    expect(parsed.command.positionals).toBeUndefined();
  });

  test("includes usage and examples when present", () => {
    const raw = getHelp({ cliName: "my-cli", commands: sampleCLICommands, command: "price", format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.command.usage).toBeUndefined(); // price has no custom usage
    expect(parsed.command.examples).toContain("my-cli price 2330");
    expect(parsed.command.examples).toContain("my-cli price TXF-S");
  });

  test("includes globalOptions at the top level", () => {
    const opts = [{ flag: "--json", desc: "JSON output" }, { flag: "--verbose", desc: "Verbose" }];
    const raw = getHelp({ cliName: "my-cli", commands: sampleCLICommands, globalOptions: opts, format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.globalOptions).toEqual(opts);
  });

  test("includes globalExamples at the top level", () => {
    const examples = ["my-cli open https://x.com", "my-cli price AAPL"];
    const raw = getHelp({ cliName: "my-cli", commands: sampleCLICommands, globalExamples: examples, format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.globalExamples).toEqual(examples);
  });

  test("omits globalExamples when absent", () => {
    const raw = getHelp({ cliName: "my-cli", commands: sampleCLICommands, format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.globalExamples).toBeUndefined();
  });

  test("explicit positionals win over inputSchema-derived ones in JSON output", () => {
    const manual: CLICommand = {
      name: "manual",
      summary: "Manual sub-command",
      inputSchema: z.object({ target: z.string().describe("from schema") }),
      positionalKeys: ["target"],
      positionals: [{ flag: "list", desc: "sub-command entry" }],
      execute: async () => ({}),
    };
    const raw = getHelp({ cliName: "my-cli", commands: [manual], command: "manual", format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.command.positionals).toEqual([{ flag: "list", desc: "sub-command entry" }]);
    expect(parsed.command.positionals[0].flag).not.toBe("target");
  });

  test("respects sorted: false — preserves insertion order", () => {
    const raw = getHelp({
      cliName: "my-cli",
      commands: [
        makeCmd({ name: "zeta", summary: "Z" }),
        makeCmd({ name: "alpha", summary: "A" }),
        makeCmd({ name: "beta", summary: "B" }),
      ],
      sorted: false,
      format: "json",
    });
    const parsed = JSON.parse(raw);
    expect(parsed.commands.map((c: Record<string, unknown>) => c.name)).toEqual(["zeta", "alpha", "beta"]);
  });

  test("commands sorted by name by default", () => {
    const raw = getHelp({
      cliName: "my-cli",
      commands: [
        makeCmd({ name: "zeta", summary: "Z" }),
        makeCmd({ name: "alpha", summary: "A" }),
        makeCmd({ name: "beta", summary: "B" }),
      ],
      format: "json",
    });
    const parsed = JSON.parse(raw);
    expect(parsed.commands.map((c: Record<string, unknown>) => c.name)).toEqual(["alpha", "beta", "zeta"]);
  });

  test("footer is not included in JSON output", () => {
    const raw = getHelp({ cliName: "my-cli", commands: sampleCLICommands, footer: "Some footer", format: "json" });
    const parsed = JSON.parse(raw);
    expect(parsed.footer).toBeUndefined();
  });

  test("footer does render in human format", () => {
    const output = getHelp({ cliName: "my-cli", commands: sampleCLICommands, footer: "Some footer", format: "human" });
    expect(output).toContain("Some footer");
  });

  test("human format output is not valid JSON", () => {
    const output = getHelp({ cliName: "my-cli", commands: sampleCLICommands });
    expect(() => JSON.parse(output)).toThrow();
  });

  test("JSON format output is always parseable", () => {
    const withCmd = getHelp({ cliName: "my-cli", commands: sampleCLICommands, command: "nope", format: "json" });
    const empty = getHelp({ cliName: "my-cli", commands: [], format: "json" });
    const normal = getHelp({ cliName: "my-cli", commands: sampleCLICommands, format: "json" });
    expect(() => JSON.parse(withCmd)).not.toThrow();
    expect(() => JSON.parse(empty)).not.toThrow();
    expect(() => JSON.parse(normal)).not.toThrow();
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

  test("derives options and positionals from inputSchema", () => {
    const s = getHelp({ cliName: "my-cli", commands: [schemaCmd], command: "backtest", format: "human" });
    expect(s).toContain("--days <n>");
    expect(s).toContain("replay last n days");
    expect(s).toContain("--json");
    expect(s).toContain("machine-readable report");
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
    const s = getHelp({ cliName: "my-cli", commands: [manual], command: "manual", format: "human" });
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
    const s = getHelp({
      cliName: "my-cli",
      commands: [cmd],
      command: "backtest",
      globalOptions: [
        { flag: "--help, -h", desc: "Show this help message" },
        { flag: "--json", desc: "output JSON" },
        { flag: "--no-cache", desc: "skip cache" },
      ],
      format: "human",
    });
    expect(s.match(/--json/g)).toHaveLength(1);
    expect(s).toContain("machine-readable full report");
    expect(s).not.toContain("output JSON");
    expect(s).toContain("--no-cache");
    expect(s.match(/--help/g)).toHaveLength(1);
  });

  test("no duplicate --help when global options already list it", () => {
    const bare: CLICommand = makeCmd({ name: "bare", summary: "Bare" });
    const s = getHelp({
      cliName: "my-cli",
      commands: [bare],
      command: "bare",
      globalOptions: [
        { flag: "--help, -h", desc: "Show this help message" },
        { flag: "--json", desc: "JSON output" },
      ],
      format: "human",
    });
    expect(s.match(/--help/g)).toHaveLength(1);
  });

  test("command without inputSchema exposes no flags of its own", () => {
    const bare: CLICommand = makeCmd({ name: "bare", summary: "Bare" });
    const s = getHelp({
      cliName: "my-cli",
      commands: [bare],
      command: "bare",
      globalOptions: [{ flag: "--json", desc: "JSON output" }],
      format: "human",
    });
    expect(s).toContain("--json");
    expect(s).toContain("--help");
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
    const s = getHelp({
      cliName: "my-cli",
      commands: [cmd],
      command: "cached",
      globalOptions: [
        { flag: "--json", desc: "JSON output" },
        { flag: "--no-cache", desc: "disable cache" },
      ],
      format: "human",
    });
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
    const s = getHelp({ cliName: "my-cli", commands: [cmd], command: "mycmd", format: "human" });
    expect(s.match(/--help/g)).toHaveLength(1);
    expect(s).toContain("Show this help message");
  });
});
