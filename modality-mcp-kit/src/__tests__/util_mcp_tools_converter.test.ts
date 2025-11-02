import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { ModalityFastMCP, setupAITools } from "../util_mcp_tools_converter";
import type { AITools, FastMCPTool } from "../schemas/schemas_tool_config";

describe("ModalityFastMCP", () => {
  test("should add and retrieve tools", () => {
    const mcp = new ModalityFastMCP();
    const tool: FastMCPTool = {
      name: "testTool",
      description: "A test tool",
      execute: async () => "result",
    };

    mcp.addTool(tool);

    expect(mcp.getTools()).toHaveLength(1);
    expect(mcp.getTools()[0].name).toBe("testTool");
  });

  test("should replace tool with same name", () => {
    const mcp = new ModalityFastMCP();

    mcp.addTool({ name: "tool", execute: async () => "v1" } as FastMCPTool);
    mcp.addTool({ name: "tool", execute: async () => "v2" } as FastMCPTool);

    expect(mcp.getTools()).toHaveLength(1);
  });
});

describe("setupAITools", () => {
  test("should return tools unchanged without MCP server", () => {
    const schema = z.object({ id: z.string() });
    const aiTools: AITools<{ getTool: typeof schema }> = {
      getTool: {
        execute: async (args) => `User ${args.id}`,
        inputSchema: schema,
      },
    };

    const result = setupAITools(aiTools);

    expect(result).toBe(aiTools);
  });

  test("should register tools with MCP server and transform inputSchema to parameters", () => {
    const mcp = new ModalityFastMCP();
    const schema = z.object({ query: z.string() });
    const aiTools: AITools<{ search: typeof schema }> = {
      search: {
        name: "searchTool",
        description: "Search tool",
        execute: async (args) => `Results for ${args.query}`,
        inputSchema: schema,
      },
    };

    setupAITools(aiTools, mcp);
    const tools = mcp.getTools();

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("searchTool");
    expect(tools[0].parameters).toBe(schema);
    expect((tools[0] as any).inputSchema).toBeUndefined();
  });

  test("should use key as name when tool.name is undefined", () => {
    const mcp = new ModalityFastMCP();
    const aiTools: AITools = {
      myToolKey: {
        execute: async () => "result",
      },
    };

    setupAITools(aiTools, mcp);

    expect(mcp.getTools()[0].name).toBe("myToolKey");
  });
});
