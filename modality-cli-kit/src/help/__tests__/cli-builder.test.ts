import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { buildCliFromTools } from "../cli-builder";
import { setNoColor } from "../colors";

// Disable colors for deterministic string comparison
setNoColor(true);

const tools = [
  {
    name: "click",
    description: "Click on an element",
    inputSchema: z.object({
      selector: z.string().describe("CSS selector"),
      force: z.boolean().optional().describe("Force click"),
    }),
  },
  {
    name: "convert",
    description: "Convert a value",
    inputSchema: z.object({
      symbol: z.string().describe("Asset symbol"),
      amount: z.coerce.number().describe("Amount"),
      json: z.boolean().optional().describe("JSON output"),
    }),
    aliases: ["cv"],
    positionalKeys: ["symbol", "amount"],
    examples: ["my-cli convert BTC 5"],
  },
];

const build = () =>
  buildCliFromTools(tools, {
    cliName: "my-cli",
    tagline: "My awesome CLI",
  });

describe("buildCliFromTools", () => {
  test("derives one command per named tool", () => {
    const cli = build();
    expect(cli.commands.map((s) => s.name)).toEqual(["click", "convert"]);
  });

  test("maps schema fields to flag options", () => {
    const cli = build();
    const click = cli.commands.find((s) => s.name === "click")!;
    expect(click.options!.map((o) => o.flag)).toContain("--selector");
    expect(click.options!.map((o) => o.flag)).toContain("--force");
  });

  test("annotated positionals become positional args, not flags", () => {
    const cli = build();
    const convert = cli.commands.find((s) => s.name === "convert")!;
    expect(convert.positionals!.map((p) => p.flag)).toEqual(["symbol", "amount"]);
    // symbol/amount must NOT also appear as flags
    expect(convert.options!.map((o) => o.flag)).not.toContain("--symbol");
  });

  test("registers aliases pointing at the canonical name", () => {
    const cli = build();
    expect(cli.aliases["cv"]).toBe("convert");
  });

  test("skips tools without a name", () => {
    const cli = buildCliFromTools([{ description: "no name" }], {
      cliName: "x",
      tagline: "x",
    });
    expect(cli.commands).toHaveLength(0);
  });

  test("getHelp() renders the global help page", () => {
    const help = build().getHelp();
    expect(help).toContain("my-cli");
    expect(help).toContain("My awesome CLI");
    expect(help).toContain("click");
    expect(help).toContain("convert");
  });

  test("getHelp(name) renders per-command help with positionals", () => {
    const help = build().getHelp("convert");
    expect(help).toContain("my-cli convert");
    expect(help).toContain("<symbol>");
    expect(help).toContain("Asset symbol");
  });

  test("passes custom usage lines through as flat strings", () => {
    const cli = buildCliFromTools(
      [{ name: "convert", description: "Convert", usage: ["my-cli convert <symbol> <amount>"] }],
      { cliName: "my-cli", tagline: "t" },
    );
    const convert = cli.commands.find((s) => s.name === "convert")!;
    // Must stay a flat string[], not get re-wrapped into string[][].
    expect(convert.usage).toEqual(["my-cli convert <symbol> <amount>"]);
    expect(cli.getHelp("convert")).toContain("my-cli convert <symbol> <amount>");
  });

  test("getHelp(alias) resolves to the canonical command", () => {
    const help = build().getHelp("cv");
    expect(help).toContain("my-cli convert");
  });

  test("getHelp(unknown) reports an unknown command", () => {
    const help = build().getHelp("nope");
    expect(help).toContain("Unknown command");
  });

  test("createFlagRejector flags an unknown option", () => {
    const reject = build().createFlagRejector();
    const warnings = reject("click", ["--bogus"]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  test("createFlagRejector accepts a known option", () => {
    const reject = build().createFlagRejector();
    expect(reject("click", ["--selector", ".btn"])).toEqual([]);
  });

  test("builds global options from globalOptionsSchema", () => {
    const cli = buildCliFromTools(tools, {
      cliName: "my-cli",
      tagline: "t",
      globalOptionsSchema: z.object({
        verbose: z.boolean().optional().describe("Verbose output"),
      }),
    });
    expect(cli.helpConfig.globalOptions!.map((o) => o.flag)).toContain("--verbose");
  });

  test("skipFields excludes a field from every tool's options", () => {
    const cli = buildCliFromTools(
      [
        {
          name: "convert",
          description: "Convert a value",
          inputSchema: z.object({
            symbol: z.string().describe("Asset symbol"),
            amount: z.coerce.number().describe("Amount"),
            json: z.boolean().optional().describe("JSON output"),
          }),
        },
      ],
      { cliName: "my-cli", tagline: "t", skipFields: ["json"] },
    );
    const convert = cli.commands.find((s) => s.name === "convert")!;
    expect(convert.options!.map((o) => o.flag)).not.toContain("--json");
    // non-skipped fields are unaffected
    expect(convert.options!.map((o) => o.flag)).toContain("--amount");
  });

  test("skipFields applies even to tools without annotations", () => {
    const cli = buildCliFromTools(tools, {
      cliName: "my-cli",
      tagline: "t",
      skipFields: ["force"],
    });
    const click = cli.commands.find((s) => s.name === "click")!;
    expect(click.options!.map((o) => o.flag)).not.toContain("--force");
    expect(click.options!.map((o) => o.flag)).toContain("--selector");
  });

  test("per-tool keyMap hidden:false un-hides a globally skipped field", () => {
    const cli = buildCliFromTools(
      [
        {
          name: "convert",
          description: "Convert a value",
          inputSchema: z.object({
            symbol: z.string().describe("Asset symbol"),
            json: z.boolean().optional().describe("JSON output"),
          }),
          keyMap: { json: { hidden: false } },
        },
      ],
      { cliName: "my-cli", tagline: "t", skipFields: ["json"] },
    );
    const convert = cli.commands.find((s) => s.name === "convert")!;
    expect(convert.options!.map((o) => o.flag)).toContain("--json");
  });
});
