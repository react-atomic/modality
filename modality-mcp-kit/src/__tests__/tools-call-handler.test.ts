/**
 * Tests for Tools/Call Handler
 *
 * Core functionality tests for MCP tools/call JSON-RPC handler
 * covering tool lookup, execution, and result handling
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { handleToolCall } from "../handlers/tools-call-handler.js";
import type { FastMCPTool } from "../schemas/schemas_tool_config.js";

describe("handleToolCall", () => {
  let mockTools: FastMCPTool<any, any>[];

  beforeEach(() => {
    mockTools = [];
  });

  it("should find and execute a tool by name", async () => {
    const executeFn = mock(() => Promise.resolve("success"));
    mockTools = [
      {
        name: "test-tool",
        description: "A test tool",
        parameters: undefined,
        execute: executeFn,
      },
    ];

    const result = await handleToolCall(
      { name: "test-tool" },
      mockTools
    );

    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toBe("success");
  });

  it("should throw ERROR_METHOD_NOT_FOUND for missing tool", async () => {
    mockTools = [];

    expect(async () => {
      await handleToolCall({ name: "nonexistent-tool" }, mockTools);
    }).toThrow();
  });

  it("should pass arguments to tool execution", async () => {
    const executeFn = mock(() => Promise.resolve("ok"));
    mockTools = [
      {
        name: "test-tool",
        description: "Tool",
        parameters: undefined,
        execute: executeFn,
      },
    ];

    const args = { param1: "value1", param2: 42 };
    await handleToolCall({ name: "test-tool", arguments: args }, mockTools);

    expect(executeFn).toHaveBeenCalledWith(args);
  });

  it("should handle empty arguments as empty object", async () => {
    const executeFn = mock(() => Promise.resolve("ok"));
    mockTools = [
      {
        name: "test-tool",
        description: "Tool",
        parameters: undefined,
        execute: executeFn,
      },
    ];

    await handleToolCall({ name: "test-tool" }, mockTools);

    expect(executeFn).toHaveBeenCalledWith({});
  });

  it("should normalize string results to TextContent", async () => {
    mockTools = [
      {
        name: "test-tool",
        description: "Tool",
        parameters: undefined,
        execute: async () => "string result",
      },
    ];

    const result = await handleToolCall(
      { name: "test-tool" },
      mockTools
    );

    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("string result");
  });

  it("should pass through CallToolResult", async () => {
    const toolResult = {
      content: [{ type: "text" as const, text: "Tool output" }],
      structuredContent: { score: 95 },
    };

    mockTools = [
      {
        name: "test-tool",
        description: "Tool",
        parameters: undefined,
        execute: async () => toolResult,
      },
    ];

    const result = await handleToolCall(
      { name: "test-tool" },
      mockTools
    );

    expect(result.content).toEqual(toolResult.content);
    expect(result.structuredContent).toEqual(toolResult.structuredContent);
  });

  it("should convert exceptions to isError response", async () => {
    mockTools = [
      {
        name: "failing-tool",
        description: "Tool that fails",
        parameters: undefined,
        execute: async () => {
          throw new Error("Tool execution failed");
        },
      },
    ];

    const result = await handleToolCall(
      { name: "failing-tool" },
      mockTools
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Tool execution failed");
  });

  it("should handle non-Error exceptions", async () => {
    mockTools = [
      {
        name: "failing-tool",
        description: "Tool",
        parameters: undefined,
        execute: async () => {
          throw "String error";
        },
      },
    ];

    const result = await handleToolCall(
      { name: "failing-tool" },
      mockTools
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("String error");
  });

  it("should always return valid CallToolResult", async () => {
    mockTools = [
      {
        name: "test-tool",
        description: "Tool",
        parameters: undefined,
        execute: async () => "result",
      },
    ];

    const result = await handleToolCall(
      { name: "test-tool" },
      mockTools
    );

    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThanOrEqual(1);
    expect(result.content[0].type).toBeDefined();
  });

  it("should work with multiple tools", async () => {
    mockTools = [
      {
        name: "tool1",
        description: "First tool",
        parameters: undefined,
        execute: async () => "tool1-result",
      },
      {
        name: "tool2",
        description: "Second tool",
        parameters: undefined,
        execute: async () => "tool2-result",
      },
    ];

    const result = await handleToolCall(
      { name: "tool2" },
      mockTools
    );

    expect(result.content[0].text).toBe("tool2-result");
  });
});
