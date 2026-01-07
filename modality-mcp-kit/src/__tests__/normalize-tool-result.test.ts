/**
 * Tests for Tool Result Normalizer
 *
 * Core functionality tests covering the essential use cases
 * for converting tool results to MCP CallToolResult format
 */

import { describe, it, expect } from "bun:test";
import {
  normalizeToolResult,
  normalizeToolResultSafe,
  normalizeToolError,
} from "../utils/normalize-tool-result.js";
import { validateCallToolResult } from "../types/mcp-result-types.js";

describe("normalizeToolResult", () => {
  it("should wrap string results as TextContent", () => {
    const result = normalizeToolResult("Hello, World!");

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("Hello, World!");
  });

  it("should pass through valid CallToolResult", () => {
    const input = {
      content: [{ type: "text" as const, text: "Result" }],
      structuredContent: { score: 95 },
    };

    const result = normalizeToolResult(input);

    expect(result.content).toEqual(input.content);
    expect(result.structuredContent).toEqual(input.structuredContent);
  });

  it("should convert plain objects to structuredContent", () => {
    const obj = { status: "ok", data: 123 };
    const result = normalizeToolResult(obj);

    expect(result.structuredContent).toEqual(obj);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("Result:");
  });

  it("should handle null and undefined", () => {
    const nullResult = normalizeToolResult(null);
    const undefinedResult = normalizeToolResult(undefined);

    expect(nullResult.content).toHaveLength(0);
    expect(undefinedResult.content).toHaveLength(0);
  });

  it("should reject invalid CallToolResult with error message", () => {
    const invalid = {
      content: [{ type: "image", data: "test" }], // Missing mimeType
    };

    expect(() => normalizeToolResult(invalid)).toThrow("Invalid CallToolResult");
  });

  it("should reject empty content array", () => {
    const invalid = { content: [] };

    expect(() => normalizeToolResult(invalid)).toThrow("Invalid CallToolResult");
  });
});

describe("normalizeToolResultSafe", () => {
  it("should not throw on invalid input", () => {
    const invalid = { content: [] };

    expect(() => normalizeToolResultSafe(invalid)).not.toThrow();
  });

  it("should return error result on validation failure", () => {
    const invalid = { content: [{ type: "invalid-type" }] };
    const result = normalizeToolResultSafe(invalid);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid");
  });
});

describe("normalizeToolError", () => {
  it("should convert Error object to isError response", () => {
    const error = new Error("Something went wrong");
    const result = normalizeToolError(error);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Something went wrong");
  });

  it("should convert string error", () => {
    const result = normalizeToolError("Error message");

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error message");
  });
});

describe("Result validation compliance", () => {
  it("should produce valid CallToolResult for string input", () => {
    const result = normalizeToolResult("test");
    const validation = validateCallToolResult(result);

    expect(validation.valid).toBe(true);
  });

  it("should produce valid CallToolResult for plain object", () => {
    const result = normalizeToolResult({ data: 123 });
    const validation = validateCallToolResult(result);

    expect(validation.valid).toBe(true);
  });

  it("should produce valid error CallToolResult", () => {
    const result = normalizeToolError("Error");
    const validation = validateCallToolResult(result);

    expect(validation.valid).toBe(true);
  });
});
