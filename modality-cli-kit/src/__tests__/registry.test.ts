import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { createCommandRegistry } from "../registry";
import type { CLICommand } from "../help/types";

// Minimal real commands — each records the args it was executed with.
const makeCmd = (name: string | undefined, ret: unknown = { success: true }): CLICommand =>
  ({
    name,
    description: `${name} command`,
    inputSchema: z.object({}),
    execute: async (args: unknown) => (ret === "echo" ? args : ret),
  }) as unknown as CLICommand;

describe("createCommandRegistry", () => {
  test("resolves a command by its canonical name", () => {
    const foo = makeCmd("foo");
    const registry = createCommandRegistry([foo]);
    expect(registry.get("foo")).toBe(foo);
  });

  test("resolves a command by any of its aliases", () => {
    const bar = makeCmd("bar");
    const registry = createCommandRegistry([bar], { bar: ["b", "baz"] });
    expect(registry.get("b")).toBe(bar);
    expect(registry.get("baz")).toBe(bar);
  });

  test("returns undefined for an unknown name", () => {
    const registry = createCommandRegistry([makeCmd("foo")]);
    expect(registry.get("nope")).toBeUndefined();
  });

  test("skips commands that have no name without breaking others", () => {
    const foo = makeCmd("foo");
    const nameless = makeCmd(undefined);
    const registry = createCommandRegistry([nameless, foo]);
    expect(registry.get("foo")).toBe(foo);
    // The nameless command is unreachable via get() but must not throw.
    expect(registry.get("")).toBeUndefined();
  });

  test("exposes all commands in declaration order", () => {
    const a = makeCmd("a");
    const b = makeCmd("b");
    const registry = createCommandRegistry([a, b]);
    expect(registry.all).toEqual([a, b]);
  });

  test("all excludes nameless commands so it matches what is registered", () => {
    const a = makeCmd("a");
    const nameless = makeCmd(undefined);
    const b = makeCmd("b");
    const registry = createCommandRegistry([a, nameless, b]);
    expect(registry.all).toEqual([a, b]);
  });

  test("exposes the supplied alias map, defaulting to empty", () => {
    expect(createCommandRegistry([makeCmd("a")]).aliases).toEqual({});
    const aliases = { a: ["x"] };
    expect(createCommandRegistry([makeCmd("a")], aliases).aliases).toBe(aliases);
  });

  test("execute() resolves and runs the command, forwarding args", async () => {
    const echo = makeCmd("echo", "echo");
    const registry = createCommandRegistry([echo]);
    expect(await registry.execute("echo", { target: "x" })).toEqual({ target: "x" });
  });

  test("execute() resolves via alias too", async () => {
    const echo = makeCmd("echo", "echo");
    const registry = createCommandRegistry([echo], { echo: ["e"] });
    expect(await registry.execute("e", { v: 1 })).toEqual({ v: 1 });
  });

  test("execute() returns a failure envelope for an unknown command", async () => {
    const registry = createCommandRegistry([makeCmd("foo")]);
    expect(await registry.execute("ghost", {})).toEqual({
      success: false,
      error: "Unknown command: ghost",
    });
  });

  // ── Regression / edge-case coverage ─────────────────────────────────────

  test("empty commands array produces an empty registry", () => {
    const registry = createCommandRegistry([]);
    expect(registry.all).toEqual([]);
    expect(registry.get("anything")).toBeUndefined();
  });

  test("multiple aliases for different commands resolve independently", () => {
    const a = makeCmd("alpha");
    const b = makeCmd("beta");
    const registry = createCommandRegistry([a, b], {
      alpha: ["a1", "a2"],
      beta: ["b1"],
    });
    expect(registry.get("a1")).toBe(a);
    expect(registry.get("a2")).toBe(a);
    expect(registry.get("b1")).toBe(b);
    expect(registry.get("b2")).toBeUndefined();
  });

  test("duplicate command names keep the last one registered", () => {
    const first = makeCmd("dup", { success: true, version: 1 });
    const second = makeCmd("dup", { success: true, version: 2 });
    const registry = createCommandRegistry([first, second]);
    // Last one wins in the map
    expect(registry.get("dup")).toBe(second);
  });

  test("execute() on empty registry returns failure envelope", async () => {
    const registry = createCommandRegistry([]);
    expect(await registry.execute("anything", {})).toEqual({
      success: false,
      error: "Unknown command: anything",
    });
  });

  test("execute() passes args object directly to the command", async () => {
    const echo = makeCmd("echo", "echo");
    const registry = createCommandRegistry([echo]);
    const args = { deep: { nested: true }, list: [1, 2, 3] };
    expect(await registry.execute("echo", args)).toEqual(args);
  });
});
