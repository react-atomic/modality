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
  },
];

const build = () =>
  buildCliFromTools(tools, {
    cliName: "my-cli",
    tagline: "My awesome CLI",
    toolAnnotations: {
      convert: {
        positionals: ["symbol", "amount"],
        aliases: ["cv"],
        examples: ["my-cli convert BTC 5"],
      },
    },
  });

describe("buildCliFromTools", () => {
  test("derives one subcommand per named tool", () => {
    const cli = build();
    expect(cli.subcommands.map((s) => s.name)).toEqual(["click", "convert"]);
  });

  test("maps schema fields to flag options", () => {
    const cli = build();
    const click = cli.subcommands.find((s) => s.name === "click")!;
    expect(click.options!.map((o) => o.flag)).toContain("--selector");
    expect(click.options!.map((o) => o.flag)).toContain("--force");
  });

  test("annotated positionals become positional args, not flags", () => {
    const cli = build();
    const convert = cli.subcommands.find((s) => s.name === "convert")!;
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
    expect(cli.subcommands).toHaveLength(0);
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
});
