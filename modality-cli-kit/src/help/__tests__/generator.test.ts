import { describe, test, expect } from "bun:test";
import { setNoColor } from "../colors";
import {
  generateHelp,
  generateCommandHelp,
  renderSubcommand,
  renderSection,
} from "../generator";
import type { Subcommand, HelpConfig } from "../types";

// Disable colors for deterministic string comparison
setNoColor(true);

const sampleSubcommands: Subcommand[] = [
  { name: "open", summary: "Navigate to a URL" },
  { name: "click", summary: "Click an element" },
  {
    name: "price",
    summary: "Price analysis",
    options: [
      { flag: "--timeframe", arg: "<TF>", desc: "Candle timeframe" },
      { flag: "--lookback", arg: "<N>", desc: "Lookback window" },
    ],
    examples: ["my-cli price 2330", "my-cli price TXF-S"],
  },
];

const sampleConfig: HelpConfig = {
  cliName: "my-cli",
  tagline: "My CLI tool",
  subcommands: sampleSubcommands,
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

  test("lists all subcommands", () => {
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

  test("sorts subcommands alphabetically by default", () => {
    const help = generateHelp({
      ...sampleConfig,
      subcommands: [
        { name: "zeta", summary: "Z" },
        { name: "alpha", summary: "A" },
        { name: "beta", summary: "B" },
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
      subcommands: [
        { name: "zeta", summary: "Z" },
        { name: "alpha", summary: "A" },
      ],
    });
    const zetaIdx = help.indexOf("zeta");
    const alphaIdx = help.indexOf("alpha");
    expect(zetaIdx).toBeLessThan(alphaIdx);
  });

  test("handles empty subcommands", () => {
    const help = generateHelp({ ...sampleConfig, subcommands: [] });
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

  test("empty subcommand list still renders header", () => {
    const out = renderSubcommand(
      { name: "test", summary: "Test command" },
      16,
      true,
    );
    expect(out).toContain("test");
    expect(out).toContain("Test command");
  });

  test("non-compact mode renders positionals beneath the summary", () => {
    const out = renderSubcommand(
      {
        name: "convert",
        summary: "Convert a value",
        positionals: [{ flag: "symbol", desc: "Asset symbol" }],
      },
      16,
      false,
    );
    expect(out).toContain("<symbol>");
    expect(out).toContain("Asset symbol");
  });
});

describe("generateCommandHelp", () => {
  test("includes CLI name and subcommand name", () => {
    const help = generateCommandHelp("my-cli", sampleSubcommands[2]!);
    expect(help).toContain("my-cli price");
    expect(help).toContain("Price analysis");
  });

  test("includes subcommand with no options", () => {
    const help = generateCommandHelp("my-cli", sampleSubcommands[0]!);
    expect(help).toContain("my-cli open");
    expect(help).toContain("Navigate to a URL");
  });

  test("includes options section", () => {
    const help = generateCommandHelp("my-cli", sampleSubcommands[2]!);
    expect(help).toContain("--timeframe");
    expect(help).toContain("--lookback");
    expect(help).toContain("Candle timeframe");
  });

  test("includes examples", () => {
    const help = generateCommandHelp("my-cli", sampleSubcommands[2]!);
    expect(help).toContain("my-cli price 2330");
    expect(help).toContain("my-cli price TXF-S");
  });

  test("appends global options when provided", () => {
    const help = generateCommandHelp("my-cli", sampleSubcommands[0]!, [
      { flag: "--json", desc: "JSON output" },
    ]);
    expect(help).toContain("--json");
  });

  test("uses custom usage lines", () => {
    const sc: Subcommand = {
      name: "trade",
      summary: "Manage trades",
      usage: ["my-cli trade <subcommand> [options]", "my-cli trade open --force"],
    };
    const help = generateCommandHelp("my-cli", sc);
    expect(help).toContain("my-cli trade <subcommand>");
    expect(help).toContain("my-cli trade open");
  });

  test("renders positionals in the usage line and an Arguments section", () => {
    const sc: Subcommand = {
      name: "convert",
      summary: "Convert a value",
      positionals: [
        { flag: "symbol", desc: "Asset symbol", required: true },
        { flag: "amount", arg: "<N>", desc: "Amount", type: "number" },
      ],
      options: [{ flag: "--json", desc: "JSON output" }],
    };
    const help = generateCommandHelp("my-cli", sc);
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
