import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { createCliRunner } from "../../createCliRunner";
import { defaultCommandsFor } from "..";
import { createCommandRegistry } from "../../registry";
import { setNoColor } from "../../help/colors";
import type { CLICommand } from "../../help/types";

// Deterministic help strings.
setNoColor(true);

const alpha = {
  name: "alpha",
  description: "First command",
  inputSchema: z.object({}),
  execute: async () => ({ success: true, result: { a: 1 } }),
} as unknown as CLICommand;

const beta = {
  name: "beta",
  description: "Second command",
  inputSchema: z.object({}),
  execute: async () => ({ success: true, result: { b: 2 } }),
} as unknown as CLICommand;

const makeRunner = (options?: Partial<Parameters<typeof createCliRunner>[0]>) =>
  createCliRunner({
    cliName: "demo",
    tagline: "Demo CLI",
    registry: createCommandRegistry([alpha, beta]),
    ...options,
  });

describe("default commands", () => {
  test("merge is registered without the CLI declaring it", () => {
    expect(makeRunner().getHelp()).toContain("merge");
  });

  test("merge help uses the CLI's own command names in examples", () => {
    const help = makeRunner().getHelp("merge");
    expect(help).toContain("demo alpha --json && demo beta --json");
    // The brace form is the only one that pipes both commands into the sink.
    expect(help).toContain("{ demo alpha");
  });

  test("withoutDefaultCommand: true registers none", () => {
    expect(makeRunner({ withoutDefaultCommand: true }).getHelp()).not.toContain("merge");
  });

  test("withoutDefaultCommand: [\"merge\"] drops just that one", () => {
    const help = makeRunner({ withoutDefaultCommand: ["merge"] }).getHelp();
    expect(help).not.toContain("merge");
    expect(help).toContain("alpha");
  });

  test("a CLI's own command of the same name wins over the default", async () => {
    const ownMerge = {
      name: "merge",
      description: "Custom merge",
      inputSchema: z.object({}),
      execute: async () => ({ success: true, message: "mine" }),
    } as unknown as CLICommand;

    const runner = createCliRunner({
      cliName: "demo",
      tagline: "Demo CLI",
      registry: createCommandRegistry([alpha, ownMerge]),
    });
    expect(runner.getHelp()).toContain("Custom merge");
  });

  test("a default command bypasses the aiTool, which has no case for it", async () => {
    const seen: unknown[] = [];
    const runner = makeRunner({
      // An aiTool that would reject anything the consuming package didn't declare.
      aiTool: {
        execute: async (args: unknown) => {
          seen.push(args);
          return { success: false, error: "aiTool should not see default commands" };
        },
      } as never,
    });

    // Pose as a TTY so the sink returns its usage hint instead of blocking on
    // stdin; swallow that hint so it doesn't pollute the test output.
    const original = process.stdin.isTTY;
    const origErr = console.error;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    console.error = () => {};
    try {
      await runner.run(["merge"]);
      expect(seen).toEqual([]);
    } finally {
      console.error = origErr;
      Object.defineProperty(process.stdin, "isTTY", { value: original, configurable: true });
    }
  });

  test("non-default commands still route through the aiTool", async () => {
    const seen: unknown[] = [];
    const runner = makeRunner({
      aiTool: {
        execute: async (args: unknown) => {
          seen.push(args);
          return { success: true };
        },
      } as never,
    });

    await runner.run(["alpha"]);
    expect(seen).toEqual([{ command: "alpha" }]);
  });
});

describe("defaultCommandsFor", () => {
  test("registers merge when nothing is disabled", () => {
    const commands = defaultCommandsFor("demo", createCommandRegistry([alpha, beta]), undefined);
    expect(commands.map((cmd) => cmd.name)).toEqual(["merge"]);
  });

  test("returns none when disabled is true", () => {
    expect(defaultCommandsFor("demo", createCommandRegistry([alpha, beta]), true)).toEqual([]);
  });

  test("drops the named default when disabled lists it", () => {
    expect(defaultCommandsFor("demo", createCommandRegistry([alpha, beta]), ["merge"])).toEqual([]);
  });

  test("skips a default the CLI already defines under the same name", () => {
    const ownMerge = {
      name: "merge",
      description: "Custom merge",
      inputSchema: z.object({}),
      execute: async () => ({ success: true }),
    } as unknown as CLICommand;

    expect(defaultCommandsFor("demo", createCommandRegistry([ownMerge]), undefined)).toEqual([]);
  });

  test("tailors the merge usage to the CLI name and its command names", () => {
    const [merge] = defaultCommandsFor("demo", createCommandRegistry([alpha, beta]), undefined);
    expect(merge?.usage?.[0]).toContain("{ demo alpha --json && demo beta --json; }");
  });

  test("falls back to alpha/beta when the registry has no commands", () => {
    const [merge] = defaultCommandsFor("demo", createCommandRegistry([]), undefined);
    expect(merge?.usage?.[0]).toContain("{ demo alpha --json && demo beta --json; }");
  });

  test("pairs a single command with the beta fallback", () => {
    const [merge] = defaultCommandsFor("demo", createCommandRegistry([alpha]), undefined);
    expect(merge?.usage?.[0]).toContain("{ demo alpha --json && demo beta --json; }");
  });

  test("an alias under the default's name also suppresses it", () => {
    // `get` resolves aliases too, so a CLI whose alias "merge" points at its own
    // command shadows the default without needing withoutDefaultCommand.
    const registry = createCommandRegistry([alpha, beta], { alpha: ["merge"] });
    expect(defaultCommandsFor("demo", registry, undefined)).toEqual([]);
  });
});
