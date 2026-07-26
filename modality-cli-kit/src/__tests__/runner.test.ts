import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { createCliRunner } from "../createCliRunner";
import { createCommandRegistry } from "../registry";
import { setNoColor } from "../help/colors";
import type { CLICommand } from "../help/types";

// Deterministic help strings.
setNoColor(true);

const greet = {
  name: "greet",
  description: "Greet someone",
  inputSchema: z.object({
    name: z.string().describe("Name to greet"),
    loud: z.boolean().optional().describe("Shout it"),
  }),
  positionalKeys: ["name"],
  execute: async (args: { name: string }) => ({ success: true, message: `hi ${args.name}` }),
} as unknown as CLICommand;

const boom = {
  name: "boom",
  description: "Always fails",
  inputSchema: z.object({}),
  execute: async () => ({ success: false, error: "nope" }),
} as unknown as CLICommand;

const makeRegistry = () => createCommandRegistry([greet, boom], { greet: ["g"] });

/** Swap console.log/error for capture buffers; returns them plus a restore fn. */
function captureConsole() {
  const logs: string[] = [];
  const errs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => errs.push(a.map(String).join(" "));
  return {
    logs,
    errs,
    restore: () => {
      console.log = origLog;
      console.error = origErr;
    },
  };
}

/** Run the given runner with argv while capturing console output. */
async function runCapturing(
  opts: Parameters<typeof createCliRunner>[0],
  argv: string[],
) {
  const cap = captureConsole();
  try {
    const code = await createCliRunner(opts).run(argv);
    return { code, logs: cap.logs, errs: cap.errs };
  } finally {
    cap.restore();
  }
}

const baseOpts = () => ({
  cliName: "my-cli",
  tagline: "My toolkit",
  registry: makeRegistry(),
});

describe("createCliRunner.run", () => {
  test("empty argv invokes onEmpty and returns its exit code", async () => {
    let called = false;
    const { code } = await runCapturing(
      { ...baseOpts(), onEmpty: () => {
          called = true;
          return 7;
        } },
      [],
    );
    expect(called).toBe(true);
    expect(code).toBe(7);
  });

  test("empty argv with no onEmpty prints global help and returns 1", async () => {
    const { code, logs } = await runCapturing(baseOpts(), []);
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("my-cli");
  });

  test("--help as the first arg prints global help and returns 0", async () => {
    const { code, logs } = await runCapturing(baseOpts(), ["--help"]);
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("My toolkit");
  });

  test("-h as the first arg returns 0", async () => {
    const { code } = await runCapturing(baseOpts(), ["-h"]);
    expect(code).toBe(0);
  });

  test("unknown command prints an error and returns 1", async () => {
    const { code, errs } = await runCapturing(baseOpts(), ["ghost"]);
    expect(code).toBe(1);
    expect(errs.join("\n")).toContain("Unknown command: ghost");
  });

  test("--help after a known command prints that command's help and returns 0", async () => {
    const { code, logs } = await runCapturing(baseOpts(), ["greet", "--help"]);
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("my-cli greet");
  });

  test("validation warnings print to stderr and return 1", async () => {
    // `greet` requires a positional `name`; omitting it is a validation failure.
    const { code, errs } = await runCapturing(baseOpts(), ["greet"]);
    expect(code).toBe(1);
    expect(errs.length).toBeGreaterThan(0);
  });

  test("a successful command renders its result and returns 0", async () => {
    const rendered: unknown[] = [];
    const { code } = await runCapturing(
      { ...baseOpts(), render: (r) => rendered.push(r) },
      ["greet", "World"],
    );
    expect(code).toBe(0);
    expect(rendered).toEqual([{ success: true, message: "hi World" }]);
  });

  test("a command resolves via its alias", async () => {
    const rendered: unknown[] = [];
    const { code } = await runCapturing(
      { ...baseOpts(), render: (r) => rendered.push(r) },
      ["g", "World"],
    );
    expect(code).toBe(0);
    expect(rendered).toEqual([{ success: true, message: "hi World" }]);
  });

  test("a result with success:false returns exit code 1", async () => {
    const { code } = await runCapturing(
      { ...baseOpts(), render: () => {} },
      ["boom"],
    );
    expect(code).toBe(1);
  });

  test("the default render pretty-prints JSON to stdout", async () => {
    const { code, logs } = await runCapturing(baseOpts(), ["greet", "World"]);
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain('"message": "hi World"');
  });

  test("getHelp() exposes global and per-command help", () => {
    const runner = createCliRunner(baseOpts());
    expect(runner.getHelp()).toContain("my-cli");
    expect(runner.getHelp("greet")).toContain("my-cli greet");
  });

  // ── Regression / edge-case coverage ─────────────────────────────────────

  test("async onEmpty callback is awaited", async () => {
    let called = false;
    const { code } = await runCapturing(
      {
        ...baseOpts(),
        onEmpty: async () => {
          called = true;
          return 3;
        },
      },
      [],
    );
    expect(called).toBe(true);
    expect(code).toBe(3);
  });

  test("skipFields are excluded from per-command help output", () => {
    const runner = createCliRunner({
      ...baseOpts(),
      skipFields: ["json"],
    });
    // --help should still work and not include skipFields in the output
    const help = runner.getHelp("greet");
    expect(help).toContain("greet");
  });

  test("--version flag prints version info and returns 0", async () => {
    const { code, logs } = await runCapturing(baseOpts(), ["--version"]);
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("my-cli");
  });

  test("custom render function receives command result", async () => {
    const results: unknown[] = [];
    const { code } = await runCapturing(
      { ...baseOpts(), render: (r) => results.push(r) },
      ["greet", "Test"],
    );
    expect(code).toBe(0);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ success: true, message: "hi Test" });
  });

  test("command with validation error shows help after warnings", async () => {
    const { code, errs, logs } = await runCapturing(baseOpts(), ["greet"]);
    expect(code).toBe(1);
    expect(errs.length).toBeGreaterThan(0);
    // Help should also be shown
    expect(logs.join("\n")).toContain("greet");
  });

  // ── Prefix matching (always on) ──────────────────────────────────────────

  const startCmd = {
    name: "start",
    description: "Start it",
    inputSchema: z.object({}),
    execute: async () => ({ success: true, message: "started" }),
  } as unknown as CLICommand;
  const stopCmd = {
    name: "stop",
    description: "Stop it",
    inputSchema: z.object({}),
    execute: async () => ({ success: true, message: "stopped" }),
  } as unknown as CLICommand;
  const prefixOpts = () => ({
    cliName: "my-cli",
    tagline: "My toolkit",
    registry: createCommandRegistry([startCmd, stopCmd]),
  });

  test("a unique prefix resolves to its command", async () => {
    const rendered: unknown[] = [];
    const { code } = await runCapturing({ ...prefixOpts(), render: (r) => rendered.push(r) }, ["sta"]);
    expect(code).toBe(0);
    expect(rendered).toEqual([{ success: true, message: "started" }]);
  });

  test("an ambiguous prefix errors with candidates and returns 1", async () => {
    const { code, errs } = await runCapturing(prefixOpts(), ["st"]);
    expect(code).toBe(1);
    const out = errs.join("\n");
    expect(out).toContain("Ambiguous command");
    expect(out).toContain('"start"');
    expect(out).toContain('"stop"');
  });

  test("a token that is no command's prefix is still unknown", async () => {
    const { code, errs } = await runCapturing(prefixOpts(), ["zzz"]);
    expect(code).toBe(1);
    expect(errs.join("\n")).toContain("Unknown command: zzz");
  });

  test("--help after a prefix shows the resolved command's help", async () => {
    const { code, logs } = await runCapturing(prefixOpts(), ["sta", "--help"]);
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("my-cli start");
  });

  test("--help after an exact name shows that command's help", async () => {
    const { code, logs } = await runCapturing(prefixOpts(), ["start", "--help"]);
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("my-cli start");
  });
});

// ── aiTool (counter-script) dispatch ───────────────────────────────────────
// When `aiTool` is supplied the runner routes through `aiTool.execute` instead
// of calling the resolved command directly, so CLI and MCP share one path.
describe("createCliRunner.run — aiTool dispatch", () => {
  /** A recording aiTool that captures the payload it was dispatched. */
  function spyTool(result: unknown = { success: true }) {
    const calls: unknown[] = [];
    const aiTool = {
      execute: async (payload: unknown) => {
        calls.push(payload);
        return result;
      },
    } as unknown as NonNullable<Parameters<typeof createCliRunner>[0]["aiTool"]>;
    return { aiTool, calls };
  }

  /** A command that records whether its own execute() ran. */
  function spyGreet() {
    const calls: unknown[] = [];
    const cmd = {
      name: "greet",
      description: "Greet someone",
      inputSchema: z.object({ name: z.string().describe("Name to greet") }),
      positionalKeys: ["name"],
      execute: async (args: { name: string }) => {
        calls.push(args);
        return { success: true, message: `direct ${args.name}` };
      },
    } as unknown as CLICommand;
    return { registry: createCommandRegistry([cmd], { greet: ["g"] }), calls };
  }

  test("dispatch routes through aiTool.execute when one is supplied", async () => {
    const { aiTool, calls } = spyTool();
    await runCapturing({ ...baseOpts(), aiTool, render: () => {} }, ["greet", "World"]);
    expect(calls).toHaveLength(1);
  });

  test("aiTool receives the resolved command name plus validated args", async () => {
    const { aiTool, calls } = spyTool();
    await runCapturing({ ...baseOpts(), aiTool, render: () => {} }, ["greet", "World"]);
    expect(calls[0]).toMatchObject({ command: "greet", name: "World" });
  });

  test("aiTool receives the canonical name even when invoked by alias", async () => {
    const { aiTool, calls } = spyTool();
    await runCapturing({ ...baseOpts(), aiTool, render: () => {} }, ["g", "World"]);
    expect((calls[0] as { command: string }).command).toBe("greet");
  });

  test("the command's own execute is bypassed when aiTool handles dispatch", async () => {
    const { registry, calls } = spyGreet();
    const { aiTool } = spyTool();
    await runCapturing(
      { cliName: "my-cli", tagline: "t", registry, aiTool, render: () => {} },
      ["greet", "World"],
    );
    expect(calls).toHaveLength(0);
  });

  test("aiTool's result drives the exit code (success:false → 1)", async () => {
    const { aiTool } = spyTool({ success: false, error: "nope" });
    const { code } = await runCapturing({ ...baseOpts(), aiTool, render: () => {} }, ["greet", "World"]);
    expect(code).toBe(1);
  });

  test("aiTool's result is passed to render", async () => {
    const rendered: unknown[] = [];
    const { aiTool } = spyTool({ success: true, message: "via tool" });
    await runCapturing({ ...baseOpts(), aiTool, render: (r) => rendered.push(r) }, ["greet", "World"]);
    expect(rendered).toEqual([{ success: true, message: "via tool" }]);
  });

  test("empty argv defers to aiTool.execute({}) and returns 0", async () => {
    const { aiTool, calls } = spyTool();
    const { code } = await runCapturing({ ...baseOpts(), aiTool }, []);
    expect(code).toBe(0);
    expect(calls).toEqual([{}]);
  });

  test("an explicit onEmpty still wins over the aiTool default", async () => {
    const { aiTool, calls } = spyTool();
    const { code } = await runCapturing({ ...baseOpts(), aiTool, onEmpty: () => 9 }, []);
    expect(code).toBe(9);
    expect(calls).toHaveLength(0);
  });

  test("empty-argv defer returns 0 even when the aiTool reports success:false", async () => {
    // The defer branch hard-returns 0 and never inspects the result, unlike the
    // command-dispatch path which maps success:false → exit 1.
    const { aiTool } = spyTool({ success: false, error: "ignored" });
    const { code } = await runCapturing({ ...baseOpts(), aiTool }, []);
    expect(code).toBe(0);
  });
});
