import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  cmd,
  header,
  opt,
  arg,
  example,
  dim,
  bold,
  error,
  success,
  note,
  link,
  color,
  setNoColor,
} from "../colors";

describe("colors", () => {
  // Save and restore NO_COLOR behavior
  const origEnv = process.env.NO_COLOR;
  const origTty = process.stdout.isTTY;

  beforeEach(() => {
    setNoColor(false);
  });

  afterEach(() => {
    // Restore env but don't rely on setNoColor reverting to auto-detect
    setNoColor(false);
  });

  test("returns colored text when color enabled", () => {
    const result = cmd("my-cli");
    expect(result).toContain("\x1b[");
    expect(result).toContain("my-cli");
    expect(result).toContain("\x1b[0m"); // reset
  });

  test("returns plain text when noColor is set", () => {
    setNoColor(true);
    expect(cmd("test")).toBe("test");
    expect(header("test")).toBe("test");
    expect(opt("test")).toBe("test");
    expect(arg("test")).toBe("test");
    expect(example("test")).toBe("test");
    expect(dim("test")).toBe("test");
    expect(bold("test")).toBe("test");
    expect(error("test")).toBe("test");
    expect(success("test")).toBe("test");
    expect(note("test")).toBe("test");
    expect(link("test")).toBe("test");
    expect(color("red", "test")).toBe("test");
  });

  test("cmd is cyan bold", () => {
    setNoColor(false);
    const r = cmd("open");
    expect(r).toMatch(/\x1b\[1m/);   // bold
    expect(r).toMatch(/\x1b\[36m/);  // cyan
  });

  test("error is red", () => {
    setNoColor(false);
    const r = error("fail");
    expect(r).toMatch(/\x1b\[31m/);
  });

  test("success is green bold", () => {
    setNoColor(false);
    const r = success("done");
    expect(r).toMatch(/\x1b\[1m/);
    expect(r).toMatch(/\x1b\[32m/);
  });

  test("note is italic gray", () => {
    setNoColor(false);
    const r = note("hint");
    expect(r).toMatch(/\x1b\[3m/);   // italic
    expect(r).toMatch(/\x1b\[90m/);  // gray
  });

  test("link is underline cyan", () => {
    setNoColor(false);
    const r = link("https://example.com");
    expect(r).toMatch(/\x1b\[4m/);   // underline
    expect(r).toMatch(/\x1b\[36m/);  // cyan
  });

  test("color() applies named color", () => {
    setNoColor(false);
    expect(color("red", "x")).toMatch(/\x1b\[31m/);
    expect(color("green", "x")).toMatch(/\x1b\[32m/);
    expect(color("blue", "x")).toMatch(/\x1b\[34m/);
    expect(color("magenta", "x")).toMatch(/\x1b\[35m/);
  });
});
