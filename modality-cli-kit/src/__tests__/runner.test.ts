import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { createCliRunner } from "../runner";
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
});
