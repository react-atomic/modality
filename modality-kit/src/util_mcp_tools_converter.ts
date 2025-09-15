import type { FastMCP } from "fastmcp";
import type { AITools } from "./schemas/schemas_tool_config.ts";
import type { z } from "zod";

/**
 * Setup function that optionally registers AITools with MCP server
 * Automatically infers and preserves schema types from the input
 * @param aiTools - The AITools object with schema mapping
 * @param mcpServer - Optional MCP server to register tools with
 * @returns The same AITools object with preserved types
 */
export const setupAITools = <T extends Record<string, z.ZodSchema>>(
  aiTools: AITools<T>,
  mcpServer?: FastMCP
): AITools<T> => {
  // Only register tools with MCP server if provided
  if (mcpServer) {
    Object.entries(aiTools).forEach(([toolName, aiTool]) => {
      let name = null != aiTool.name ? aiTool.name : toolName;
      const { inputSchema, ...restAITool } = aiTool; // Destructure to avoid unused variable warning
      mcpServer.addTool({
        ...restAITool,
        parameters: inputSchema,
        name,
      });
    });
  }

  return aiTools;
};
