import { describe, expect, test } from "bun:test";
import {
  buildMcpConfig,
  DEFAULT_HOST,
  DEFAULT_PORT,
  resolveHostname,
  resolveMethodsDir,
  resolvePort,
} from "../utils/cli-config";

const CWD = "/proj";

describe("resolveMethodsDir", () => {
  test("defaults to <cwd>/methods when nothing is specified", () => {
    expect(resolveMethodsDir(CWD).dir).toBe("/proj/methods");
  });

  test("default folder is not marked explicit", () => {
    expect(resolveMethodsDir(CWD).explicit).toBe(false);
  });

  test("CLI argument resolves relative to cwd", () => {
    expect(resolveMethodsDir(CWD, "custom").dir).toBe("/proj/custom");
  });

  test("CLI argument is marked explicit", () => {
    expect(resolveMethodsDir(CWD, "custom").explicit).toBe(true);
  });

  test("package.json methodsDir is used when no CLI argument", () => {
    expect(resolveMethodsDir(CWD, undefined, "from-pkg").dir).toBe(
      "/proj/from-pkg",
    );
  });

  test("package.json methodsDir is marked explicit", () => {
    expect(resolveMethodsDir(CWD, undefined, "from-pkg").explicit).toBe(true);
  });

  test("CLI argument wins over package.json methodsDir", () => {
    expect(resolveMethodsDir(CWD, "from-arg", "from-pkg").dir).toBe(
      "/proj/from-arg",
    );
  });

  test("absolute CLI argument is kept as-is", () => {
    expect(resolveMethodsDir(CWD, "/abs/methods").dir).toBe("/abs/methods");
  });
});

describe("buildMcpConfig", () => {
  test("falls back to default identity when package.json is empty", () => {
    expect(buildMcpConfig({})).toEqual({
      name: "modality-mcp",
      version: "0.0.0",
    });
  });

  test("uses package.json name and version", () => {
    expect(buildMcpConfig({ name: "counter-chromium", version: "1.0.0" })).toEqual(
      { name: "counter-chromium", version: "1.0.0" },
    );
  });

  test("passes helloWorld through from the mcp block", () => {
    expect(buildMcpConfig({ mcp: { helloWorld: "hi" } }).helloWorld).toBe("hi");
  });

  test("passes mcpPath through from the mcp block", () => {
    expect(buildMcpConfig({ mcp: { mcpPath: "/api/mcp" } }).mcpPath).toBe(
      "/api/mcp",
    );
  });

  test("omits helloWorld key entirely when not configured", () => {
    expect("helloWorld" in buildMcpConfig({})).toBe(false);
  });
});

describe("resolvePort", () => {
  test("PORT env wins over configured port", () => {
    expect(resolvePort("4000", 5000)).toBe(4000);
  });

  test("configured port is used when env is unset", () => {
    expect(resolvePort(undefined, 5000)).toBe(5000);
  });

  test("defaults when neither env nor config is set", () => {
    expect(resolvePort(undefined, undefined)).toBe(DEFAULT_PORT);
  });

  test("non-numeric PORT env falls back to default", () => {
    expect(resolvePort("abc", undefined)).toBe(DEFAULT_PORT);
  });

  test("empty PORT env falls back to configured port", () => {
    expect(resolvePort("", 5000)).toBe(5000);
  });

  test("PORT env above 65535 falls back to default", () => {
    expect(resolvePort("70000", undefined)).toBe(DEFAULT_PORT);
  });

  test("negative PORT env falls back to default", () => {
    expect(resolvePort("-1", undefined)).toBe(DEFAULT_PORT);
  });

  test("PORT env of 0 is kept for OS-assigned ephemeral port", () => {
    expect(resolvePort("0", undefined)).toBe(0);
  });
});

describe("resolveHostname", () => {
  test("HOST env wins over configured host", () => {
    expect(resolveHostname("127.0.0.1", "10.0.0.1")).toBe("127.0.0.1");
  });

  test("configured host is used when env is unset", () => {
    expect(resolveHostname(undefined, "10.0.0.1")).toBe("10.0.0.1");
  });

  test("defaults when neither env nor config is set", () => {
    expect(resolveHostname(undefined, undefined)).toBe(DEFAULT_HOST);
  });
});
